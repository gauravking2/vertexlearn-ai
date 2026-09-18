import request from 'supertest';
import { createApp } from '../src/app';
import { useTestDb } from './helpers';
import { addModuleLecture, makePublishedCourse, registerAndLogin } from './phase2-helpers';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await useTestDb();
  app = createApp();
});

describe('notes and bookmarks', () => {
  test('create note success', async () => {
    const instructor = await registerAndLogin(app, 'p2-nb-teach1@example.com');
    const student = await registerAndLogin(app, 'p2-nb-stud1@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Notes Course One');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const res = await request(app)
      .post(`/api/v1/lectures/${lectureId}/notes`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ timestampSeconds: 42, content: 'Remember this' });
    expect(res.status).toBe(201);
    expect(res.body.content).toBe('Remember this');
  });

  test('notes ownership isolation (student B cannot see student A notes)', async () => {
    const instructor = await registerAndLogin(app, 'p2-nb-teach2@example.com');
    const studentA = await registerAndLogin(app, 'p2-nb-studA@example.com', 'student');
    const studentB = await registerAndLogin(app, 'p2-nb-studB@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Notes Course Two');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${studentA.token}`).send({});
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${studentB.token}`).send({});
    await request(app).post(`/api/v1/lectures/${lectureId}/notes`).set('Authorization', `Bearer ${studentA.token}`).send({ timestampSeconds: 5, content: 'private A' });
    const listB = await request(app).get(`/api/v1/lectures/${lectureId}/notes`).set('Authorization', `Bearer ${studentB.token}`);
    expect(listB.status).toBe(200);
    expect((listB.body.data as { content: string }[]).some((n) => n.content === 'private A')).toBe(false);
  });

  test('non-enrolled cannot create notes', async () => {
    const instructor = await registerAndLogin(app, 'p2-nb-teach3@example.com');
    const student = await registerAndLogin(app, 'p2-nb-stud3@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Notes Course Three');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    const res = await request(app)
      .post(`/api/v1/lectures/${lectureId}/notes`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ timestampSeconds: 1, content: 'nope' });
    expect(res.status).toBe(403);
  });

  test('create bookmark success', async () => {
    const instructor = await registerAndLogin(app, 'p2-nb-teach4@example.com');
    const student = await registerAndLogin(app, 'p2-nb-stud4@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Bookmark Course One');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const res = await request(app)
      .post(`/api/v1/lectures/${lectureId}/bookmarks`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ timestampSeconds: 77 });
    expect(res.status).toBe(201);
    expect(res.body.timestamp_seconds).toBe(77);
  });

  test('bookmarks ownership isolation', async () => {
    const instructor = await registerAndLogin(app, 'p2-nb-teach5@example.com');
    const studentA = await registerAndLogin(app, 'p2-nb-studC@example.com', 'student');
    const studentB = await registerAndLogin(app, 'p2-nb-studD@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Bookmark Course Two');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${studentA.token}`).send({});
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${studentB.token}`).send({});
    await request(app).post(`/api/v1/lectures/${lectureId}/bookmarks`).set('Authorization', `Bearer ${studentA.token}`).send({ timestampSeconds: 11 });
    const listB = await request(app).get(`/api/v1/lectures/${lectureId}/bookmarks`).set('Authorization', `Bearer ${studentB.token}`);
    expect(listB.status).toBe(200);
    expect(listB.body.data).toEqual([]);
  });

  test('unauthorized notes/bookmarks rejected', async () => {
    const nRes = await request(app).post('/api/v1/lectures/00000000-0000-4000-8000-eeeeeeeeeeee/notes').send({ content: 'x' });
    expect(nRes.status).toBe(401);
    const bRes = await request(app).post('/api/v1/lectures/00000000-0000-4000-8000-eeeeeeeeeeee/bookmarks').send({ timestampSeconds: 1 });
    expect(bRes.status).toBe(401);
  });
});
