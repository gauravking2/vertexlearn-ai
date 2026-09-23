import request from 'supertest';
import { createApp } from '../src/app';
import { setEmbeddingProviderForTests } from '../src/ai/embeddings';
import { setLlmProviderForTests } from '../src/ai/llm';
import { useTestDb } from './helpers';
import { addModuleLecture, makePublishedCourse, registerAndLogin } from './phase2-helpers';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await useTestDb();
  app = createApp();
  setEmbeddingProviderForTests({
    name: 'test-deterministic',
    dim: 1536,
    async embed(texts: string[]) {
      const { deterministicEmbedding } = await import('../src/ai/embeddings');
      return texts.map((t) => deterministicEmbedding(t, 1536));
    },
  });
  setLlmProviderForTests({
    name: 'test-mock',
    async chat(input) {
      const m = /\[S(\d+)\]/.exec(input.user);
      if (input.user.includes('(no relevant course material retrieved)')) {
        return 'I could not find this in the course material.';
      }
      return `Grounded answer using ${m ? m[0] : '[S1]'} only.`;
    },
  });
});

afterAll(() => {
  setEmbeddingProviderForTests(undefined);
  setLlmProviderForTests(undefined);
});

async function setupCourseWithTranscript(prefix: string, transcriptA: string): Promise<{
  instructorToken: string;
  studentToken: string;
  courseId: string;
  lectureId: string;
  moduleId: string;
}> {
  const instructor = await registerAndLogin(app, `p3-ai-teach-${prefix}@example.com`);
  const student = await registerAndLogin(app, `p3-ai-stud-${prefix}@example.com`, 'student');
  const courseId = await makePublishedCourse(app, instructor.token, `AI Course ${prefix}`);
  const { lectureId, moduleId } = await addModuleLecture(app, instructor.token, courseId, `Module ${prefix}`, `Lecture ${prefix}`);
  await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
  const ingested = await request(app)
    .post(`/api/v1/ai/lectures/${lectureId}/transcript`)
    .set('Authorization', `Bearer ${instructor.token}`)
    .send({ transcript: transcriptA });
  expect(ingested.status).toBe(201);
  return { instructorToken: instructor.token, studentToken: student.token, courseId, lectureId, moduleId };
}

describe('AI tutor + RAG', () => {
  test('chat session create + message returns course-scoped citations', async () => {
    const s = await setupCourseWithTranscript('chat1', 'Photosynthesis converts sunlight into chemical energy in chloroplasts. It releases oxygen as a byproduct.');
    const session = await request(app)
      .post('/api/v1/ai/chat/sessions')
      .set('Authorization', `Bearer ${s.studentToken}`)
      .send({ courseId: s.courseId, mode: 'beginner' });
    expect(session.status).toBe(201);
    const msg = await request(app)
      .post(`/api/v1/ai/chat/sessions/${session.body.id}/messages`)
      .set('Authorization', `Bearer ${s.studentToken}`)
      .send({ content: 'What does photosynthesis release?' });
    expect(msg.status).toBe(201);
    expect(msg.body.grounded).toBe(true);
    expect(msg.body.answer).toContain('[S1]');
    expect(msg.body.sources.length).toBeGreaterThan(0);
  });

  test('placeholder answer from the AI service is never surfaced or persisted', async () => {
    const s = await setupCourseWithTranscript(
      'placeholder1',
      'Osmosis moves water across a semipermeable membrane from low to high solute concentration.',
    );
    const prevUrl = process.env.AI_SERVICE_URL;
    const prevToken = process.env.AI_SERVICE_TOKEN;
    const realFetch = global.fetch;
    // A reachable AI service that answers with mock text — the exact
    // production failure that previously stored a citation-carrying
    // "answer" containing none of the course material.
    process.env.AI_SERVICE_URL = 'http://127.0.0.1:59999';
    process.env.AI_SERVICE_TOKEN = 'test-token';
    global.fetch = (async () =>
      new Response(JSON.stringify({ answer: 'Mock answer: I am the AI service', grounded: true, sources: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof global.fetch;
    try {
      const session = await request(app)
        .post('/api/v1/ai/chat/sessions')
        .set('Authorization', `Bearer ${s.studentToken}`)
        .send({ courseId: s.courseId });
      const msg = await request(app)
        .post(`/api/v1/ai/chat/sessions/${session.body.id}/messages`)
        .set('Authorization', `Bearer ${s.studentToken}`)
        .send({ content: 'How does osmosis move water?' });
      expect(msg.status).toBe(201);
      expect(msg.body.provider).toMatch(/^local-rag/);
      expect(msg.body.answer).not.toMatch(/mock answer|placeholder/i);
      expect(msg.body.grounded).toBe(true);
      expect(msg.body.answer).toContain('[S1]');
      const { db } = await import('../src/db/pool');
      const stored = await db.query(`SELECT content FROM ai_chat_messages WHERE session_id = $1 AND role = 'assistant'`, [session.body.id]);
      for (const row of stored.rows as { content: string }[]) {
        expect(row.content).not.toMatch(/mock answer|placeholder/i);
      }
    } finally {
      global.fetch = realFetch;
      if (prevUrl === undefined) delete process.env.AI_SERVICE_URL;
      else process.env.AI_SERVICE_URL = prevUrl;
      if (prevToken === undefined) delete process.env.AI_SERVICE_TOKEN;
      else process.env.AI_SERVICE_TOKEN = prevToken;
    }
  });

  test('course isolation: Course A chat cannot retrieve Course B chunks', async () => {
    const a = await setupCourseWithTranscript('isoA', 'Alpha course teaches photosynthesis and chloroplasts in depth.');
    const b = await setupCourseWithTranscript('isoB', 'Beta course teaches quantum tunneling in semiconductors.');
    const session = await request(app)
      .post('/api/v1/ai/chat/sessions')
      .set('Authorization', `Bearer ${a.studentToken}`)
      .send({ courseId: a.courseId });
    const msg = await request(app)
      .post(`/api/v1/ai/chat/sessions/${session.body.id}/messages`)
      .set('Authorization', `Bearer ${a.studentToken}`)
      .send({ content: 'quantum tunneling semiconductors' });
    expect(msg.status).toBe(201);
    const { db } = await import('../src/db/pool');
    const rows = await db.query(`SELECT course_id FROM document_chunks WHERE chunk_text ILIKE '%quantum tunneling%'`);
    expect((rows.rows as { course_id: string }[]).every((r) => r.course_id === b.courseId)).toBe(true);
    const citedLectureIds = (msg.body.sources as { lectureId: string | null }[]).map((s) => s.lectureId);
    expect(citedLectureIds).toContain(a.lectureId);
    expect(citedLectureIds).not.toContain(b.lectureId);
  });

  test('nonexistent course session rejected; unauthorized course rejected', async () => {
    const student = await registerAndLogin(app, 'p3-ai-stud-noaccess@example.com', 'student');
    const missing = await request(app)
      .post('/api/v1/ai/chat/sessions')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ courseId: '00000000-0000-4000-8000-aaaaaaaaaaaa' });
    expect(missing.status).toBe(404);
    const instructor = await registerAndLogin(app, 'p3-ai-teach-noaccess@example.com');
    const courseId = await makePublishedCourse(app, instructor.token, 'AI Locked Course');
    const denied = await request(app)
      .post('/api/v1/ai/chat/sessions')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ courseId });
    expect(denied.status).toBe(403);
  });

  test('chat authorization: student B cannot use student A session; unauthenticated rejected', async () => {
    const s = await setupCourseWithTranscript('authz1', 'Mitochondria produce cellular energy through respiration.');
    const other = await registerAndLogin(app, 'p3-ai-stud-other@example.com', 'student');
    const session = await request(app)
      .post('/api/v1/ai/chat/sessions')
      .set('Authorization', `Bearer ${s.studentToken}`)
      .send({ courseId: s.courseId });
    const forbiddenMsg = await request(app)
      .post(`/api/v1/ai/chat/sessions/${session.body.id}/messages`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ content: 'hijack?' });
    expect(forbiddenMsg.status).toBe(403);
    const anon = await request(app).post(`/api/v1/ai/chat/sessions/${session.body.id}/messages`).send({ content: 'hi' });
    expect(anon.status).toBe(401);
  });

  test('mode switching persists', async () => {
    const s = await setupCourseWithTranscript('mode1', 'Neurons transmit signals through synapses using neurotransmitters.');
    const session = await request(app)
      .post('/api/v1/ai/chat/sessions')
      .set('Authorization', `Bearer ${s.studentToken}`)
      .send({ courseId: s.courseId, mode: 'beginner' });
    const updated = await request(app)
      .put(`/api/v1/ai/chat/sessions/${session.body.id}/mode`)
      .set('Authorization', `Bearer ${s.studentToken}`)
      .send({ mode: 'advanced' });
    expect(updated.status).toBe(200);
    expect(updated.body.mode).toBe('advanced');
    const invalid = await request(app)
      .put(`/api/v1/ai/chat/sessions/${session.body.id}/mode`)
      .set('Authorization', `Bearer ${s.studentToken}`)
      .send({ mode: 'expert' });
    expect(invalid.status).toBe(400);
  });

  test('no-context behavior returns grounded limitation', async () => {
    const instructor = await registerAndLogin(app, 'p3-ai-teach-nocontext@example.com');
    const student = await registerAndLogin(app, 'p3-ai-stud-nocontext@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'AI Empty Course');
    await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const session = await request(app)
      .post('/api/v1/ai/chat/sessions')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ courseId });
    const msg = await request(app)
      .post(`/api/v1/ai/chat/sessions/${session.body.id}/messages`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ content: 'Explain quantum chromodynamics in full detail' });
    expect(msg.status).toBe(201);
    expect(msg.body.grounded).toBe(false);
    expect(msg.body.answer).toMatch(/could not find/i);
  });

  test('summarization requires access and returns key points', async () => {
    const s = await setupCourseWithTranscript('sum1', 'The water cycle has evaporation. Condensation forms clouds. Precipitation returns water to earth. Collection gathers water in oceans.');
    const res = await request(app).post(`/api/v1/ai/lectures/${s.lectureId}/summarize`).set('Authorization', `Bearer ${s.studentToken}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.summary.keyPoints.length).toBeGreaterThan(0);
    const outsider = await registerAndLogin(app, 'p3-ai-stud-sumout@example.com', 'student');
    const denied = await request(app).post(`/api/v1/ai/lectures/${s.lectureId}/summarize`).set('Authorization', `Bearer ${outsider.token}`).send({});
    expect(denied.status).toBe(403);
  });

  test('quiz generation creates pending-review draft, not an active quiz', async () => {
    const s = await setupCourseWithTranscript('draft1', 'Gravity pulls objects toward earth. Mass affects gravitational force. Weight depends on gravity and mass. Orbits balance velocity and gravity.');
    const gen = await request(app)
      .post(`/api/v1/ai/lectures/${s.lectureId}/generate-quiz`)
      .set('Authorization', `Bearer ${s.instructorToken}`)
      .send({ count: 5 });
    expect(gen.status).toBe(201);
    expect(gen.body.status).toBe('pending_review');
    expect(gen.body.activeQuizId).toBeNull();
    const { db } = await import('../src/db/pool');
    const quizzes = await db.query(`SELECT COUNT(*)::int AS count FROM quizzes WHERE course_id = $1`, [s.courseId]);
    expect((quizzes.rows[0] as { count: number }).count).toBe(0);
  });

  test('instructor approval activates the quiz; student cannot approve', async () => {
    const s = await setupCourseWithTranscript(
      'draft2',
      'Cells contain a nucleus with DNA. Ribosomes build proteins. Mitochondria supply energy. Membranes control what enters cells.',
    );
    const gen = await request(app)
      .post(`/api/v1/ai/lectures/${s.lectureId}/generate-quiz`)
      .set('Authorization', `Bearer ${s.instructorToken}`)
      .send({ count: 5 });
    const studentAttempt = await request(app)
      .post(`/api/v1/ai/quiz-drafts/${gen.body.id}/approve`)
      .set('Authorization', `Bearer ${s.studentToken}`)
      .send({});
    expect(studentAttempt.status).toBe(403);
    const approved = await request(app)
      .post(`/api/v1/ai/quiz-drafts/${gen.body.id}/approve`)
      .set('Authorization', `Bearer ${s.instructorToken}`)
      .send({});
    expect(approved.status).toBe(200);
    expect(approved.body.quizId).toBeDefined();
    const { db } = await import('../src/db/pool');
    const quiz = await db.query(`SELECT is_ai_generated FROM quizzes WHERE id = $1`, [approved.body.quizId]);
    expect((quiz.rows[0] as { is_ai_generated: boolean }).is_ai_generated).toBe(true);
  });

  test('flashcards generated and scoped to module/user', async () => {
    const s = await setupCourseWithTranscript('cards1', 'The heart pumps blood. Arteries carry blood away. Veins return blood. Capillaries exchange oxygen.');
    const res = await request(app).post(`/api/v1/ai/modules/${s.moduleId}/flashcards`).set('Authorization', `Bearer ${s.studentToken}`).send({});
    expect(res.status).toBe(201);
    expect(res.body.flashcards.length).toBeGreaterThan(0);
    const { db } = await import('../src/db/pool');
    const rows = await db.query(`SELECT user_id, module_id FROM flashcards WHERE module_id = $1`, [s.moduleId]);
    expect((rows.rows as { user_id: string; module_id: string }[]).every((r) => r.user_id && r.module_id === s.moduleId)).toBe(true);
  });

  test('study plan uses quiz history and stores structured JSON', async () => {
    const s = await setupCourseWithTranscript('plan1', 'Algebra solves for unknown variables. Equations balance both sides. Functions map inputs to outputs.');
    const quiz = await request(app).post('/api/v1/quizzes').set('Authorization', `Bearer ${s.instructorToken}`).send({
      courseId: s.courseId,
      title: 'Algebra check',
      questions: [
        { type: 'mcq', prompt: '2+2?', points: 1, options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }] },
      ],
    });
    const attempt = await request(app).post(`/api/v1/quizzes/${quiz.body.id}/attempt`).set('Authorization', `Bearer ${s.studentToken}`).send({});
    const { db } = await import('../src/db/pool');
    const opt = await db.query(`SELECT id FROM quiz_options WHERE question_id = $1 AND is_correct = false`, [quiz.body.questions[0].id]);
    await request(app)
      .post(`/api/v1/attempts/${attempt.body.id}/submit`)
      .set('Authorization', `Bearer ${s.studentToken}`)
      .send({ answers: [{ questionId: quiz.body.questions[0].id, selectedOptionIds: [(opt.rows[0] as { id: string }).id] }] });
    const plan = await request(app).post('/api/v1/ai/study-plan').set('Authorization', `Bearer ${s.studentToken}`).send({ courseId: s.courseId });
    expect(plan.status).toBe(201);
    expect(plan.body.plan.weeks.length).toBe(3);
    expect(plan.body.plan.mastery).toBe('beginner');
  });

  test('mastery endpoint documents deterministic formula', async () => {
    const s = await setupCourseWithTranscript('mastery1', 'Statistics uses mean and median. Variance measures spread. Samples estimate populations.');
    const res = await request(app).get(`/api/v1/ai/mastery/${s.courseId}`).set('Authorization', `Bearer ${s.studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.level).toBe('beginner');
    expect(res.body.formula).toContain('0.85');
  });

  test('recommendations scoped to authenticated user', async () => {
    const s = await setupCourseWithTranscript('rec1', 'Thermodynamics studies heat and energy transfer in systems.');
    const res = await request(app).get('/api/v1/recommendations/me').set('Authorization', `Bearer ${s.studentToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    const anon = await request(app).get('/api/v1/recommendations/me');
    expect(anon.status).toBe(401);
    const other = await registerAndLogin(app, 'p3-ai-stud-recother@example.com', 'student');
    const otherRes = await request(app).get('/api/v1/recommendations/me').set('Authorization', `Bearer ${other.token}`);
    expect(otherRes.body.data.some((r: { title: string }) => r.title.includes('Continue: Lecture rec1'))).toBe(false);
  });

  test('transcript ingestion requires instructor ownership', async () => {
    const s = await setupCourseWithTranscript('own1', 'Ownership test transcript content for the course material.');
    const studentTry = await request(app)
      .post(`/api/v1/ai/lectures/${s.lectureId}/transcript`)
      .set('Authorization', `Bearer ${s.studentToken}`)
      .send({ transcript: 'student override attempt with enough length to pass validation' });
    expect(studentTry.status).toBe(403);
  });
});
