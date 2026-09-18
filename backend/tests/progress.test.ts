import request from 'supertest';
import { createApp } from '../src/app';
import { useTestDb } from './helpers';
import { addModuleLecture, makePublishedCourse, registerAndLogin } from './phase2-helpers';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await useTestDb();
  app = createApp();
});

describe('lecture progress', () => {
  test('enrolled student can update progress', async () => {
    const instructor = await registerAndLogin(app, 'p2-prog-teach1@example.com');
    const student = await registerAndLogin(app, 'p2-prog-stud1@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Progress Course One');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const res = await request(app)
      .post(`/api/v1/lectures/${lectureId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ watchedSeconds: 120, completed: false });
    expect(res.status).toBe(200);
    expect(res.body.progress.watched_seconds).toBe(120);
    expect(res.body.courseProgressPercent).toBe(0);
  });

  test('non-enrolled student rejected', async () => {
    const instructor = await registerAndLogin(app, 'p2-prog-teach2@example.com');
    const student = await registerAndLogin(app, 'p2-prog-stud2@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Progress Course Two');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    const res = await request(app)
      .post(`/api/v1/lectures/${lectureId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ watchedSeconds: 10, completed: false });
    expect(res.status).toBe(403);
  });

  test('progress calculation across multiple lectures', async () => {
    const instructor = await registerAndLogin(app, 'p2-prog-teach3@example.com');
    const student = await registerAndLogin(app, 'p2-prog-stud3@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Progress Course Three');
    const first = await addModuleLecture(app, instructor.token, courseId, 'M1', 'L1');
    const second = await addModuleLecture(app, instructor.token, courseId, 'M2', 'L2');
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const r1 = await request(app)
      .post(`/api/v1/lectures/${first.lectureId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ watchedSeconds: 50, completed: true });
    expect(r1.body.courseProgressPercent).toBe(50);
    const r2 = await request(app)
      .post(`/api/v1/lectures/${second.lectureId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ watchedSeconds: 50, completed: true });
    expect(r2.body.courseProgressPercent).toBe(100);
  });

  test('unauthenticated progress rejected', async () => {
    const res = await request(app).post('/api/v1/lectures/00000000-0000-4000-8000-cccccccccccc/progress').send({ watchedSeconds: 1 });
    expect(res.status).toBe(401);
  });

  test('unknown lecture 404s for enrolled-adjacent caller', async () => {
    const student = await registerAndLogin(app, 'p2-prog-stud4@example.com', 'student');
    const res = await request(app)
      .post('/api/v1/lectures/00000000-0000-4000-8000-dddddddddddd/progress')
      .set('Authorization', `Bearer ${student.token}`)
      .send({ watchedSeconds: 1 });
    expect([403, 404]).toContain(res.status);
  });

  test('watched_seconds is monotonic (never decreases)', async () => {
    const instructor = await registerAndLogin(app, 'p2-prog-teach5@example.com');
    const student = await registerAndLogin(app, 'p2-prog-stud5@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Progress Course Five');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    await request(app).post(`/api/v1/lectures/${lectureId}/progress`).set('Authorization', `Bearer ${student.token}`).send({ watchedSeconds: 300 });
    const res = await request(app)
      .post(`/api/v1/lectures/${lectureId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ watchedSeconds: 10 });
    expect(res.status).toBe(200);
    expect(res.body.progress.watched_seconds).toBe(300);
  });
});
