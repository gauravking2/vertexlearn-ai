import request from 'supertest';
import { createApp } from '../src/app';
import { useTestDb } from './helpers';
import { makePublishedCourse, registerAndLogin, addModuleLecture } from './phase2-helpers';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await useTestDb();
  app = createApp();
});

async function setupCourseWithContent(prefix: string) {
  const instructor = await registerAndLogin(app, `p2-list-teach-${prefix}@example.com`);
  const courseId = await makePublishedCourse(app, instructor.token, `List Course ${prefix}`);
  const { moduleId, lectureId } = await addModuleLecture(app, instructor.token, courseId);
  void moduleId;
  void lectureId;
  const assignment = await request(app)
    .post('/api/v1/assignments')
    .set('Authorization', `Bearer ${instructor.token}`)
    .send({ courseId, title: `HW ${prefix}`, maxScore: 100 });
  const quiz = await request(app)
    .post('/api/v1/quizzes')
    .set('Authorization', `Bearer ${instructor.token}`)
    .send({
      courseId,
      title: `Quiz ${prefix}`,
      questions: [{ type: 'mcq', prompt: 'What is 2+2?', points: 5, options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }] }],
    });
  return { instructor, courseId, assignmentId: assignment.body.id as string, quizId: quiz.body.id as string };
}

describe('list/detail GET endpoints (Phase 4B)', () => {
  test('GET /courses/:id/assignments requires auth', async () => {
    const { courseId } = await setupCourseWithContent('auth');
    const res = await request(app).get(`/api/v1/courses/${courseId}/assignments`);
    expect(res.status).toBe(401);
  });

  test('enrolled student can list course assignments; outsider gets 403', async () => {
    const { courseId, assignmentId } = await setupCourseWithContent('studlist');
    const student = await registerAndLogin(app, 'p2-list-stud@example.com', 'student');
    const outsider = await registerAndLogin(app, 'p2-list-outsider@example.com', 'student');
    // Not enrolled yet -> 403
    const forbidden = await request(app).get(`/api/v1/courses/${courseId}/assignments`).set('Authorization', `Bearer ${student.token}`);
    expect(forbidden.status).toBe(403);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const res = await request(app).get(`/api/v1/courses/${courseId}/assignments`).set('Authorization', `Bearer ${student.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.map((a: { id: string }) => a.id)).toContain(assignmentId);
    const out = await request(app).get(`/api/v1/courses/${courseId}/assignments`).set('Authorization', `Bearer ${outsider.token}`);
    expect(out.status).toBe(403);
  });

  test('instructor owner can list assignments; instructor B gets 403', async () => {
    const { instructor, courseId } = await setupCourseWithContent('ownlist');
    const instructorB = await registerAndLogin(app, 'p2-list-teachB@example.com');
    const own = await request(app).get(`/api/v1/courses/${courseId}/assignments`).set('Authorization', `Bearer ${instructor.token}`);
    expect(own.status).toBe(200);
    const other = await request(app).get(`/api/v1/courses/${courseId}/assignments`).set('Authorization', `Bearer ${instructorB.token}`);
    expect(other.status).toBe(403);
  });

  test('GET /assignments/:id enforces enrollment; owner bypasses', async () => {
    const { instructor, courseId, assignmentId } = await setupCourseWithContent('detail');
    const student = await registerAndLogin(app, 'p2-list-detail-stud@example.com', 'student');
    const before = await request(app).get(`/api/v1/assignments/${assignmentId}`).set('Authorization', `Bearer ${student.token}`);
    expect(before.status).toBe(403);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const after = await request(app).get(`/api/v1/assignments/${assignmentId}`).set('Authorization', `Bearer ${student.token}`);
    expect(after.status).toBe(200);
    expect(after.body.id).toBe(assignmentId);
    const owner = await request(app).get(`/api/v1/assignments/${assignmentId}`).set('Authorization', `Bearer ${instructor.token}`);
    expect(owner.status).toBe(200);
  });

  test('GET /assignments/:id/my-submission returns 404 before submit, 200 after', async () => {
    const { courseId, assignmentId } = await setupCourseWithContent('mysub');
    const student = await registerAndLogin(app, 'p2-list-mysub-stud@example.com', 'student');
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const none = await request(app).get(`/api/v1/assignments/${assignmentId}/my-submission`).set('Authorization', `Bearer ${student.token}`);
    expect(none.status).toBe(404);
    await request(app).post(`/api/v1/assignments/${assignmentId}/submit`).set('Authorization', `Bearer ${student.token}`).send({ contentText: 'work' });
    const found = await request(app).get(`/api/v1/assignments/${assignmentId}/my-submission`).set('Authorization', `Bearer ${student.token}`);
    expect(found.status).toBe(200);
    expect(found.body.assignment_id).toBe(assignmentId);
  });

  test('GET /assignments/:id/submissions owner-only; IDOR blocked', async () => {
    const { instructor, courseId, assignmentId } = await setupCourseWithContent('subs');
    const instructorB = await registerAndLogin(app, 'p2-list-subB@example.com');
    const student = await registerAndLogin(app, 'p2-list-sub-stud@example.com', 'student');
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    await request(app).post(`/api/v1/assignments/${assignmentId}/submit`).set('Authorization', `Bearer ${student.token}`).send({ contentText: 's' });
    const own = await request(app).get(`/api/v1/assignments/${assignmentId}/submissions`).set('Authorization', `Bearer ${instructor.token}`);
    expect(own.status).toBe(200);
    expect(own.body.data.length).toBe(1);
    const other = await request(app).get(`/api/v1/assignments/${assignmentId}/submissions`).set('Authorization', `Bearer ${instructorB.token}`);
    expect(other.status).toBe(403);
    const stud = await request(app).get(`/api/v1/assignments/${assignmentId}/submissions`).set('Authorization', `Bearer ${student.token}`);
    expect(stud.status).toBe(403);
  });

  test('GET /courses/:id/quizzes hides correct answers from students', async () => {
    const { instructor, courseId, quizId } = await setupCourseWithContent('quizlist');
    const student = await registerAndLogin(app, 'p2-list-quiz-stud@example.com', 'student');
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const list = await request(app).get(`/api/v1/courses/${courseId}/quizzes`).set('Authorization', `Bearer ${student.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((q: { id: string }) => q.id)).toContain(quizId);
    expect(list.body.data[0]).not.toHaveProperty('questions');
    // Detail as student: no is_correct leaked
    const detailStud = await request(app).get(`/api/v1/quizzes/${quizId}`).set('Authorization', `Bearer ${student.token}`);
    expect(detailStud.status).toBe(200);
    const optsStud = detailStud.body.questions[0].options as Record<string, unknown>[];
    expect(optsStud[0]).not.toHaveProperty('is_correct');
    // Detail as owner: includes is_correct
    const detailOwn = await request(app).get(`/api/v1/quizzes/${quizId}`).set('Authorization', `Bearer ${instructor.token}`);
    expect(detailOwn.status).toBe(200);
    const optsOwn = detailOwn.body.questions[0].options as Record<string, unknown>[];
    expect(optsOwn[0]).toHaveProperty('is_correct');
  });

  test('IDOR: student B cannot read student A my-submission; outsider quiz 403', async () => {
    const { courseId, assignmentId, quizId } = await setupCourseWithContent('idor2');
    const studentA = await registerAndLogin(app, 'p2-list-A@example.com', 'student');
    const studentB = await registerAndLogin(app, 'p2-list-B@example.com', 'student');
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${studentA.token}`).send({});
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${studentB.token}`).send({});
    await request(app).post(`/api/v1/assignments/${assignmentId}/submit`).set('Authorization', `Bearer ${studentA.token}`).send({ contentText: 'A' });
    // B's own my-submission is 404 (not A's) — proves isolation
    const bOwn = await request(app).get(`/api/v1/assignments/${assignmentId}/my-submission`).set('Authorization', `Bearer ${studentB.token}`);
    expect(bOwn.status).toBe(404);
    const outsider = await registerAndLogin(app, 'p2-list-out2@example.com', 'student');
    const qOut = await request(app).get(`/api/v1/quizzes/${quizId}`).set('Authorization', `Bearer ${outsider.token}`);
    expect(qOut.status).toBe(403);
  });

  test('unknown ids return 404', async () => {
    const instructor = await registerAndLogin(app, 'p2-list-404@example.com');
    const fake = '00000000-0000-4000-8000-000000000000';
    expect((await request(app).get(`/api/v1/assignments/${fake}`).set('Authorization', `Bearer ${instructor.token}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/quizzes/${fake}`).set('Authorization', `Bearer ${instructor.token}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/courses/${fake}/assignments`).set('Authorization', `Bearer ${instructor.token}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/courses/${fake}/quizzes`).set('Authorization', `Bearer ${instructor.token}`)).status).toBe(404);
  });
});
