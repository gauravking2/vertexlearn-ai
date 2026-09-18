import request from 'supertest';
import type { Express } from 'express';

export async function registerAndLogin(
  app: Express,
  email: string,
  role: 'student' | 'instructor' = 'instructor',
): Promise<{ token: string; userId: string }> {
  await request(app).post('/api/v1/auth/register').send({ email, password: 'Password123!', name: email, role });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password123!' });
  return { token: login.body.accessToken as string, userId: (login.body.user?.id ?? '') as string };
}

export async function publishCourse(app: Express, adminEmail: string, courseId: string): Promise<void> {
  const { db } = await import('../src/db/pool');
  await db.query(`UPDATE courses SET status = 'published' WHERE id = $1`, [courseId]);
  void adminEmail;
}

export async function makePublishedCourse(app: Express, instructorToken: string, title: string): Promise<string> {
  const course = await request(app).post('/api/v1/courses').set('Authorization', `Bearer ${instructorToken}`).send({ title, description: 'desc' });
  const id = course.body.id as string;
  const { db } = await import('../src/db/pool');
  await db.query(`UPDATE courses SET status = 'published' WHERE id = $1`, [id]);
  return id;
}

export async function addModuleLecture(
  app: Express,
  instructorToken: string,
  courseId: string,
  moduleTitle = 'Module 1',
  lectureTitle = 'Lecture 1',
): Promise<{ moduleId: string; lectureId: string }> {
  const mod = await request(app).post(`/api/v1/courses/${courseId}/modules`).set('Authorization', `Bearer ${instructorToken}`).send({ title: moduleTitle });
  const lec = await request(app)
    .post(`/api/v1/courses/modules/${mod.body.id}/lectures`)
    .set('Authorization', `Bearer ${instructorToken}`)
    .send({ title: lectureTitle, durationS: 600 });
  return { moduleId: mod.body.id as string, lectureId: lec.body.id as string };
}
