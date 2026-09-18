import request from 'supertest';
import { createApp } from '../src/app';
import { useTestDb } from './helpers';
import { addModuleLecture, makePublishedCourse, registerAndLogin } from './phase2-helpers';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await useTestDb();
  app = createApp();
});

describe('certificates and gamification', () => {
  test('completion trigger creates certificate, no duplicates', async () => {
    const instructor = await registerAndLogin(app, 'p2-cert-teach1@example.com');
    const student = await registerAndLogin(app, 'p2-cert-stud1@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Cert Course One');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const first = await request(app)
      .post(`/api/v1/lectures/${lectureId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ watchedSeconds: 600, completed: true });
    expect(first.status).toBe(200);
    expect(first.body.certificate).toBeDefined();
    expect(first.body.certificate.certificate_code).toBeDefined();
    const { db } = await import('../src/db/pool');
    const count1 = await db.query(`SELECT COUNT(*)::int AS count FROM certificates WHERE user_id = $1 AND course_id = $2`, [student.userId, courseId]);
    expect((count1.rows[0] as { count: number }).count).toBe(1);
    const second = await request(app)
      .post(`/api/v1/lectures/${lectureId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ watchedSeconds: 601, completed: true });
    expect(second.status).toBe(200);
    const count2 = await db.query(`SELECT COUNT(*)::int AS count FROM certificates WHERE user_id = $1 AND course_id = $2`, [student.userId, courseId]);
    expect((count2.rows[0] as { count: number }).count).toBe(1);
  });

  test('certificate download returns PDF for owner', async () => {
    const instructor = await registerAndLogin(app, 'p2-cert-teach2@example.com');
    const student = await registerAndLogin(app, 'p2-cert-stud2@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Cert Course Two');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const prog = await request(app)
      .post(`/api/v1/lectures/${lectureId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ watchedSeconds: 600, completed: true });
    const certId = prog.body.certificate.id as string;
    const dl = await request(app).get(`/api/v1/certificates/${certId}/download`).set('Authorization', `Bearer ${student.token}`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toContain('application/pdf');
  });

  test('certificate download IDOR: other student forbidden', async () => {
    const instructor = await registerAndLogin(app, 'p2-cert-teach3@example.com');
    const studentA = await registerAndLogin(app, 'p2-cert-studA@example.com', 'student');
    const studentB = await registerAndLogin(app, 'p2-cert-studB@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Cert Course Three');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${studentA.token}`).send({});
    const prog = await request(app)
      .post(`/api/v1/lectures/${lectureId}/progress`)
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({ watchedSeconds: 600, completed: true });
    const res = await request(app).get(`/api/v1/certificates/${prog.body.certificate.id}/download`).set('Authorization', `Bearer ${studentB.token}`);
    expect(res.status).toBe(403);
  });

  test('first-course badge awarded on completion', async () => {
    const instructor = await registerAndLogin(app, 'p2-badge-teach1@example.com');
    const student = await registerAndLogin(app, 'p2-badge-stud1@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Badge Course One');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    await request(app).post(`/api/v1/lectures/${lectureId}/progress`).set('Authorization', `Bearer ${student.token}`).send({ watchedSeconds: 100, completed: true });
    const me = await request(app).get('/api/v1/gamification/me').set('Authorization', `Bearer ${student.token}`);
    expect(me.status).toBe(200);
    expect((me.body.badges as { slug: string }[]).some((b) => b.slug === 'first-course-completed')).toBe(true);
  });

  test('perfect-score badge awarded on 100% objective quiz', async () => {
    const instructor = await registerAndLogin(app, 'p2-badge-teach2@example.com');
    const student = await registerAndLogin(app, 'p2-badge-stud2@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Badge Course Two');
    const created = await request(app).post('/api/v1/quizzes').set('Authorization', `Bearer ${instructor.token}`).send({
      courseId,
      title: 'Perfect Quiz',
      questions: [{ type: 'mcq', prompt: '1+1?', points: 1, options: [{ text: '2', isCorrect: true }, { text: '3', isCorrect: false }] }],
    });
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const attempt = await request(app).post(`/api/v1/quizzes/${created.body.id}/attempt`).set('Authorization', `Bearer ${student.token}`).send({});
    const { db } = await import('../src/db/pool');
    const opt = await db.query(`SELECT id FROM quiz_options WHERE question_id = $1 AND is_correct = true`, [created.body.questions[0].id]);
    await request(app)
      .post(`/api/v1/attempts/${attempt.body.id}/submit`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ answers: [{ questionId: created.body.questions[0].id, selectedOptionIds: [(opt.rows[0] as { id: string }).id] }] });
    const me = await request(app).get('/api/v1/gamification/me').set('Authorization', `Bearer ${student.token}`);
    expect((me.body.badges as { slug: string }[]).some((b) => b.slug === 'perfect-quiz-score')).toBe(true);
  });

  test('streak updates on activity', async () => {
    const instructor = await registerAndLogin(app, 'p2-streak-teach@example.com');
    const student = await registerAndLogin(app, 'p2-streak-stud@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Streak Course');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    await request(app).post(`/api/v1/lectures/${lectureId}/progress`).set('Authorization', `Bearer ${student.token}`).send({ watchedSeconds: 5 });
    const me = await request(app).get('/api/v1/gamification/me').set('Authorization', `Bearer ${student.token}`);
    expect(me.body.streak.current_streak_days).toBeGreaterThanOrEqual(1);
  });

  test('analytics foundation returns per-lecture + quiz averages', async () => {
    const instructor = await registerAndLogin(app, 'p2-an-teach@example.com');
    const student = await registerAndLogin(app, 'p2-an-stud@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Analytics Course');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    await request(app).post(`/api/v1/lectures/${lectureId}/progress`).set('Authorization', `Bearer ${student.token}`).send({ watchedSeconds: 60, completed: true });
    const res = await request(app).get(`/api/v1/courses/${courseId}/analytics`).set('Authorization', `Bearer ${instructor.token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.perLecture)).toBe(true);
    expect(res.body.perLecture[0].completed).toBe(1);
    expect(res.body.timeOnTask).toBeDefined();
  });
});
