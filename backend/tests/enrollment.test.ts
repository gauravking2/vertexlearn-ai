import request from 'supertest';
import { createApp } from '../src/app';
import { useTestDb } from './helpers';
import { addModuleLecture, makePublishedCourse, registerAndLogin } from './phase2-helpers';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await useTestDb();
  app = createApp();
});

describe('enrollment', () => {
  test('student enrolls successfully and appears in /me', async () => {
    const instructor = await registerAndLogin(app, 'p2-enr-teach1@example.com');
    const student = await registerAndLogin(app, 'p2-enr-stud1@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Enrollable Course Alpha');
    const res = await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    expect(res.status).toBe(201);
    expect(res.body.course_id).toBe(courseId);
    expect(res.body.progress_percent).toBe(0);
    const me = await request(app).get('/api/v1/enrollments/me').set('Authorization', `Bearer ${student.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test('duplicate enrollment rejected', async () => {
    const instructor = await registerAndLogin(app, 'p2-enr-teach2@example.com');
    const student = await registerAndLogin(app, 'p2-enr-stud2@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Enrollable Course Beta');
    const first = await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    expect(first.status).toBe(201);
    const second = await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    expect(second.status).toBe(409);
  });

  test('non-published course rejected', async () => {
    const instructor = await registerAndLogin(app, 'p2-enr-teach3@example.com');
    const student = await registerAndLogin(app, 'p2-enr-stud3@example.com', 'student');
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${instructor.token}`)
      .send({ title: 'Pending Course Gamma', description: 'x' });
    const res = await request(app).post(`/api/v1/courses/${created.body.id}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    expect(res.status).toBe(403);
  });

  test('unauthorized access rejected', async () => {
    const res = await request(app).post('/api/v1/courses/00000000-0000-4000-8000-aaaaaaaaaaaa/enroll').send({});
    expect(res.status).toBe(401);
    const me = await request(app).get('/api/v1/enrollments/me');
    expect(me.status).toBe(401);
  });

  test('instructor cannot enroll (role restriction)', async () => {
    const instructor = await registerAndLogin(app, 'p2-enr-teach4@example.com');
    const courseId = await makePublishedCourse(app, instructor.token, 'Enrollable Course Delta');
    const res = await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${instructor.token}`).send({});
    expect(res.status).toBe(403);
  });

  test('enrolling in unknown course 404s', async () => {
    const student = await registerAndLogin(app, 'p2-enr-stud5@example.com', 'student');
    const res = await request(app)
      .post('/api/v1/courses/00000000-0000-4000-8000-bbbbbbbbbbbb/enroll')
      .set('Authorization', `Bearer ${student.token}`)
      .send({});
    expect(res.status).toBe(404);
  });

  test('enrollment exposes progress', async () => {
    const instructor = await registerAndLogin(app, 'p2-enr-teach6@example.com');
    const student = await registerAndLogin(app, 'p2-enr-stud6@example.com', 'student');
    const courseId = await makePublishedCourse(app, instructor.token, 'Enrollable Course Zeta');
    const { lectureId } = await addModuleLecture(app, instructor.token, courseId);
    await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${student.token}`).send({});
    const prog = await request(app)
      .post(`/api/v1/lectures/${lectureId}/progress`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ watchedSeconds: 100, completed: true });
    expect(prog.status).toBe(200);
    expect(prog.body.courseProgressPercent).toBe(100);
    const me = await request(app).get('/api/v1/enrollments/me').set('Authorization', `Bearer ${student.token}`);
    const row = (me.body.data as { course_id: string; progress_percent: number }[]).find((r) => r.course_id === courseId);
    expect(row?.progress_percent).toBe(100);
  });
});
