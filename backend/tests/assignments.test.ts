import request from 'supertest';
import { createApp } from '../src/app';
import { useTestDb } from './helpers';
import { makePublishedCourse, registerAndLogin } from './phase2-helpers';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await useTestDb();
  app = createApp();
});

async function setupCourse(prefix: string): Promise<{ instructorToken: string; courseId: string }> {
  const instructor = await registerAndLogin(app, `p2-as-teach-${prefix}@example.com`);
  const courseId = await makePublishedCourse(app, instructor.token, `Assignment Course ${prefix}`);
  return { instructorToken: instructor.token, courseId };
}

describe('assignments', () => {
  test('instructor creates assignment', async () => {
    const { instructorToken, courseId } = await setupCourse('create');
    const res = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ courseId, title: 'Homework 1', description: 'Do it', maxScore: 100 });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Homework 1');
  });

  test('student submit succeeds with storage metadata', async () => {
    const { instructorToken, courseId } = await setupCourse('submit');
    const student = await registerAndLogin(app, 'p2-as-stud-submit@example.com', 'student');
    const created = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ courseId, title: 'HW Submit', maxScore: 10 });
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const res = await request(app)
      .post(`/api/v1/assignments/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ fileName: 'hw1.pdf', fileSizeBytes: 1234, mimeType: 'application/pdf', contentText: 'answers' });
    expect(res.status).toBe(201);
    expect(res.body.storage.key).toContain(created.body.id);
    expect(res.body.storage.bucket).toBeDefined();
    expect(res.body.storage.uploadUrl).toBeDefined();
  });

  test('deadline restriction enforced', async () => {
    const { instructorToken, courseId } = await setupCourse('deadline');
    const student = await registerAndLogin(app, 'p2-as-stud-dead@example.com', 'student');
    const created = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ courseId, title: 'Old HW', dueAt: new Date(Date.now() - 3600_000).toISOString() });
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const res = await request(app)
      .post(`/api/v1/assignments/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ contentText: 'late' });
    expect(res.status).toBe(403);
  });

  test('instructor grades submission', async () => {
    const { instructorToken, courseId } = await setupCourse('grade');
    const student = await registerAndLogin(app, 'p2-as-stud-grade@example.com', 'student');
    const created = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ courseId, title: 'Grade HW', maxScore: 20 });
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const sub = await request(app)
      .post(`/api/v1/assignments/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ contentText: 'work' });
    const graded = await request(app)
      .put(`/api/v1/submissions/${sub.body.id}/grade`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ grade: 18, feedback: 'Good' });
    expect(graded.status).toBe(200);
    expect(graded.body.grade).toBe(18);
  });

  test('non-enrolled student cannot submit', async () => {
    const { instructorToken, courseId } = await setupCourse('noenroll');
    const student = await registerAndLogin(app, 'p2-as-stud-noen@example.com', 'student');
    const created = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ courseId, title: 'NoEnroll HW' });
    const res = await request(app)
      .post(`/api/v1/assignments/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ contentText: 'x' });
    expect(res.status).toBe(403);
  });

  test('IDOR: instructor B cannot grade instructor A submission', async () => {
    const a = await setupCourse('idora');
    const instructorB = await registerAndLogin(app, 'p2-as-teach-idorb@example.com');
    const student = await registerAndLogin(app, 'p2-as-stud-idor@example.com', 'student');
    const created = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${a.instructorToken}`)
      .send({ courseId: a.courseId, title: 'Victim HW' });
    await request(app).post(`/api/v1/courses/${a.courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const sub = await request(app)
      .post(`/api/v1/assignments/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ contentText: 'mine' });
    const res = await request(app)
      .put(`/api/v1/submissions/${sub.body.id}/grade`)
      .set('Authorization', `Bearer ${instructorB.token}`)
      .send({ grade: 1, feedback: 'hijack' });
    expect(res.status).toBe(403);
  });

  test('IDOR: student B cannot touch student A submission path (duplicate submit + grade forbidden)', async () => {
    const { instructorToken, courseId } = await setupCourse('stuidor');
    const studentA = await registerAndLogin(app, 'p2-as-studA2@example.com', 'student');
    const studentB = await registerAndLogin(app, 'p2-as-studB2@example.com', 'student');
    const created = await request(app)
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ courseId, title: 'Shared HW' });
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${studentA.token}`).send({});
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${studentB.token}`).send({});
    const subA = await request(app)
      .post(`/api/v1/assignments/${created.body.id}/submit`)
      .set('Authorization', `Bearer ${studentA.token}`)
      .send({ contentText: 'A work' });
    expect(subA.status).toBe(201);
    const gradeByB = await request(app)
      .put(`/api/v1/submissions/${subA.body.id}/grade`)
      .set('Authorization', `Bearer ${studentB.token}`)
      .send({ grade: 5, feedback: 'x' });
    expect(gradeByB.status).toBe(403);
  });
});
