import request from 'supertest';
import { createApp } from '../src/app';
import { useTestDb } from './helpers';

let app: ReturnType<typeof createApp>;

async function registerAndLogin(email: string, role: 'student' | 'instructor' = 'instructor'): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password: 'Password123!', name: email, role });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password123!' });
  return login.body.accessToken as string;
}

beforeAll(async () => {
  await useTestDb();
  app = createApp();
});

describe('courses foundation', () => {
  test('healthz is public', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('student cannot create a course (role restriction)', async () => {
    const token = await registerAndLogin('student-c1@example.com', 'student');
    const res = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Forbidden Course Title', description: 'nope' });
    expect(res.status).toBe(403);
  });

  test('unauthenticated course creation is rejected', async () => {
    const res = await request(app).post('/api/v1/courses').send({ title: 'No Auth Course Title' });
    expect(res.status).toBe(401);
  });

  test('instructor creates a course defaulting to pending', async () => {
    const token = await registerAndLogin('teach-c1@example.com');
    const res = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Intro to Testing', description: 'Learn testing' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.title).toBe('Intro to Testing');
  });

  test('catalog lists courses publicly with pagination', async () => {
    const res = await request(app).get('/api/v1/courses?page=1&pageSize=5');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.page).toBe(1);
    expect(typeof res.body.total).toBe('number');
  });

  test('catalog supports search filtering', async () => {
    const token = await registerAndLogin('teach-c2@example.com');
    await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Unique Zephyr Course Name', description: 'searchable' });
    // Search as the owning instructor: pending courses are visible to their
    // instructor (lifecycle management) but hidden from the public catalog.
    const res = await request(app).get('/api/v1/courses?q=Zephyr').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const anon = await request(app).get('/api/v1/courses?q=Zephyr');
    expect(anon.status).toBe(200);
    expect(anon.body.data.length).toBe(0);
  });

  test('course detail is public and includes modules', async () => {
    const token = await registerAndLogin('teach-c3@example.com');
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Detail Course Title', description: 'detail' });
    const res = await request(app).get(`/api/v1/courses/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(Array.isArray(res.body.modules)).toBe(true);
  });

  test('course detail exposes the instructor display name', async () => {
    const token = await registerAndLogin('teach-instructor-name@example.com');
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Named Instructor Course', description: 'detail' });
    const res = await request(app).get(`/api/v1/courses/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.instructor_name).toBe('teach-instructor-name@example.com');
  });

  test('course detail 404s for unknown id', async () => {
    const res = await request(app).get('/api/v1/courses/00000000-0000-4000-8000-ffffffffffff');
    expect(res.status).toBe(404);
  });

  test('owner can update own course', async () => {
    const token = await registerAndLogin('teach-c4@example.com');
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Update Me Course', description: 'before' });
    const res = await request(app)
      .put(`/api/v1/courses/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'after' });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe('after');
  });

  test('IDOR: instructor B cannot update instructor A course', async () => {
    const tokenA = await registerAndLogin('teach-idor-a@example.com');
    const tokenB = await registerAndLogin('teach-idor-b@example.com');
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Victim Course Title', description: 'victim' });
    const res = await request(app)
      .put(`/api/v1/courses/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ description: 'hijacked' });
    expect(res.status).toBe(403);
  });

  test('IDOR: instructor B cannot add modules to instructor A course', async () => {
    const tokenA = await registerAndLogin('teach-idor2-a@example.com');
    const tokenB = await registerAndLogin('teach-idor2-b@example.com');
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Victim Course Two Title', description: 'victim' });
    const res = await request(app)
      .post(`/api/v1/courses/${created.body.id}/modules`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'Hijack Module' });
    expect(res.status).toBe(403);
  });

  test('owner can add module then lecture', async () => {
    const token = await registerAndLogin('teach-c5@example.com');
    const course = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Module Lecture Course', description: 'ml' });
    const mod = await request(app)
      .post(`/api/v1/courses/${course.body.id}/modules`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Module 1' });
    expect(mod.status).toBe(201);
    const lec = await request(app)
      .post(`/api/v1/courses/modules/${mod.body.id}/lectures`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Lecture 1' });
    expect(lec.status).toBe(201);
    const detail = await request(app).get(`/api/v1/courses/${course.body.id}`);
    expect(detail.body.modules[0].lectures.length).toBe(1);
  });

  test('IDOR: instructor B cannot add lectures to instructor A module', async () => {
    const tokenA = await registerAndLogin('teach-idor3-a@example.com');
    const tokenB = await registerAndLogin('teach-idor3-b@example.com');
    const course = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Victim Course Three Title', description: 'victim' });
    const mod = await request(app)
      .post(`/api/v1/courses/${course.body.id}/modules`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Victim Module' });
    const res = await request(app)
      .post(`/api/v1/courses/modules/${mod.body.id}/lectures`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'Hijack Lecture' });
    expect(res.status).toBe(403);
  });

  test('student cannot add modules (role restriction)', async () => {
    const teacher = await registerAndLogin('teach-c6@example.com');
    const student = await registerAndLogin('student-c6@example.com', 'student');
    const course = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${teacher}`)
      .send({ title: 'Role Course Title Here', description: 'rc' });
    const res = await request(app)
      .post(`/api/v1/courses/${course.body.id}/modules`)
      .set('Authorization', `Bearer ${student}`)
      .send({ title: 'Nope' });
    expect(res.status).toBe(403);
  });
});
