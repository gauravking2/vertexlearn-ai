import request from 'supertest';
import { createApp } from '../src/app';
import { useTestDb } from './helpers';
import { makePublishedCourse, registerAndLogin } from './phase2-helpers';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await useTestDb();
  app = createApp();
});

async function setupQuiz(prefix: string): Promise<{ instructorToken: string; studentToken: string; courseId: string; quizId: string; mcqId: string; multiId: string; shortId: string }> {
  const instructor = await registerAndLogin(app, `p2-q-teach-${prefix}@example.com`);
  const student = await registerAndLogin(app, `p2-q-stud-${prefix}@example.com`, 'student');
  const courseId = await makePublishedCourse(app, instructor.token, `Quiz Course ${prefix}`);
  const created = await request(app)
    .post('/api/v1/quizzes')
    .set('Authorization', `Bearer ${instructor.token}`)
    .send({
      courseId,
      title: `Quiz ${prefix}`,
      questions: [
        { type: 'mcq', prompt: 'What is 2+2?', points: 2, options: [{ text: '3', isCorrect: false }, { text: '4', isCorrect: true }] },
        {
          type: 'multi_select',
          prompt: 'Pick evens',
          points: 2,
          options: [
            { text: '2', isCorrect: true },
            { text: '3', isCorrect: false },
            { text: '4', isCorrect: true },
          ],
        },
        { type: 'short_answer', prompt: 'Explain gravity', points: 5 },
      ],
    });
  expect(created.status).toBe(201);
  await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
  return {
    instructorToken: instructor.token,
    studentToken: student.token,
    courseId,
    quizId: created.body.id as string,
    mcqId: created.body.questions[0].id as string,
    multiId: created.body.questions[1].id as string,
    shortId: created.body.questions[2].id as string,
  };
}

describe('quizzes', () => {
  test('instructor creation', async () => {
    const s = await setupQuiz('create1');
    expect(s.quizId).toBeDefined();
  });

  test('student attempt + MCQ auto-grade (correct full score when short answer excluded path)', async () => {
    const s = await setupQuiz('mcq1');
    const attempt = await request(app).post(`/api/v1/quizzes/${s.quizId}/attempt`).set('Authorization', `Bearer ${s.studentToken}`).send({});
    expect(attempt.status).toBe(201);
    expect(attempt.body.questions.length).toBe(3);
    const { db } = await import('../src/db/pool');
    const opts = await db.query(`SELECT id, is_correct FROM quiz_options WHERE question_id = $1 ORDER BY option_text`, [s.mcqId]);
    const correct = (opts.rows as { id: string; is_correct: boolean }[]).find((o) => o.is_correct)!.id;
    const multi = await db.query(`SELECT id, is_correct FROM quiz_options WHERE question_id = $1`, [s.multiId]);
    const multiCorrect = (multi.rows as { id: string; is_correct: boolean }[]).filter((o) => o.is_correct).map((o) => o.id);
    const submit = await request(app)
      .post(`/api/v1/attempts/${attempt.body.id}/submit`)
      .set('Authorization', `Bearer ${s.studentToken}`)
      .send({ answers: [{ questionId: s.mcqId, selectedOptionIds: [correct] }, { questionId: s.multiId, selectedOptionIds: multiCorrect }, { questionId: s.shortId, answerText: 'mass attracts' }] });
    expect(submit.status).toBe(200);
    expect(submit.body.score).toBe(4);
    expect(submit.body.status).toBe('submitted');
  });

  test('multi-select partial selection is not full credit', async () => {
    const s = await setupQuiz('multi1');
    const attempt = await request(app).post(`/api/v1/quizzes/${s.quizId}/attempt`).set('Authorization', `Bearer ${s.studentToken}`).send({});
    const { db } = await import('../src/db/pool');
    const opts = await db.query(`SELECT id, is_correct FROM quiz_options WHERE question_id = $1`, [s.mcqId]);
    const wrong = (opts.rows as { id: string; is_correct: boolean }[]).find((o) => !o.is_correct)!.id;
    const multi = await db.query(`SELECT id, is_correct FROM quiz_options WHERE question_id = $1`, [s.multiId]);
    const oneOfTwo = [(multi.rows as { id: string; is_correct: boolean }[]).filter((o) => o.is_correct)[0].id];
    const submit = await request(app)
      .post(`/api/v1/attempts/${attempt.body.id}/submit`)
      .set('Authorization', `Bearer ${s.studentToken}`)
      .send({ answers: [{ questionId: s.mcqId, selectedOptionIds: [wrong] }, { questionId: s.multiId, selectedOptionIds: oneOfTwo }, { questionId: s.shortId, answerText: 'x' }] });
    expect(submit.status).toBe(200);
    expect(submit.body.score).toBe(0);
  });

  test('short-answer behavior: attempt stays submitted, not graded', async () => {
    const s = await setupQuiz('short1');
    const attempt = await request(app).post(`/api/v1/quizzes/${s.quizId}/attempt`).set('Authorization', `Bearer ${s.studentToken}`).send({});
    const { db } = await import('../src/db/pool');
    const opts = await db.query(`SELECT id FROM quiz_options WHERE question_id = $1`, [s.mcqId]);
    void opts;
    const submit = await request(app)
      .post(`/api/v1/attempts/${attempt.body.id}/submit`)
      .set('Authorization', `Bearer ${s.studentToken}`)
      .send({ answers: [{ questionId: s.shortId, answerText: 'needs human review' }] });
    expect(submit.status).toBe(200);
    expect(submit.body.status).toBe('submitted');
    const answers = await db.query(`SELECT is_correct, points_earned FROM quiz_answers WHERE attempt_id = $1`, [attempt.body.id]);
    expect((answers.rows[0] as { is_correct: boolean | null }).is_correct).toBeNull();
  });

  test('unauthorized access rejected', async () => {
    const res = await request(app).post('/api/v1/quizzes/00000000-0000-4000-8000-ffffffffffff/attempt').send({});
    expect(res.status).toBe(401);
    const sRes = await request(app).post('/api/v1/attempts/00000000-0000-4000-8000-ffffffffffff/submit').send({ answers: [] });
    expect(sRes.status).toBe(401);
  });

  test('IDOR: student B cannot submit student A attempt', async () => {
    const s = await setupQuiz('idor1');
    const studentB = await registerAndLogin(app, 'p2-q-stud-idorB@example.com', 'student');
    await request(app).post(`/api/v1/courses/${s.courseId}/enroll`).set('Authorization', `Bearer ${studentB.token}`).send({});
    const attempt = await request(app).post(`/api/v1/quizzes/${s.quizId}/attempt`).set('Authorization', `Bearer ${s.studentToken}`).send({});
    const res = await request(app)
      .post(`/api/v1/attempts/${attempt.body.id}/submit`)
      .set('Authorization', `Bearer ${studentB.token}`)
      .send({ answers: [{ questionId: s.shortId, answerText: 'hijack' }] });
    expect(res.status).toBe(403);
  });

  test('non-enrolled student cannot attempt', async () => {
    const instructor = await registerAndLogin(app, 'p2-q-teach-noen@example.com');
    const outsider = await registerAndLogin(app, 'p2-q-stud-noen@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Quiz NoEnroll');
    const created = await request(app).post('/api/v1/quizzes').set('Authorization', `Bearer ${instructor.token}`).send({
      courseId,
      title: 'Q',
      questions: [{ type: 'short_answer', prompt: 'Why?', points: 1 }],
    });
    const res = await request(app).post(`/api/v1/quizzes/${created.body.id}/attempt`).set('Authorization', `Bearer ${outsider.token}`).send({});
    expect(res.status).toBe(403);
  });
});
