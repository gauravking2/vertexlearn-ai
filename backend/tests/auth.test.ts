import request from 'supertest';
import { createApp } from '../src/app';
import { useTestDb } from './helpers';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await useTestDb();
  app = createApp();
});

describe('auth', () => {
  test('registers a student by default', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'student1@example.com', password: 'Password123!', name: 'Student One' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('student1@example.com');
    expect(res.body.user.roles).toEqual(['student']);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  test('registers an instructor when requested', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'teach1@example.com', password: 'Password123!', name: 'Teach One', role: 'instructor' });
    expect(res.status).toBe(201);
    expect(res.body.user.roles).toEqual(['instructor']);
  });

  test('rejects duplicate email', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'dupe@example.com', password: 'Password123!', name: 'Dupe' });
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'dupe@example.com', password: 'Password123!', name: 'Dupe' });
    expect(res.status).toBe(409);
  });

  test('rejects self-registered admin', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'evil@example.com', password: 'Password123!', name: 'Evil', role: 'admin' });
    expect(res.status).toBe(409);
  });

  test('rejects invalid input', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short', name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('logs in with valid credentials', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'login1@example.com', password: 'Password123!', name: 'Login One' });
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'login1@example.com', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe('login1@example.com');
  });

  test('rejects invalid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('rejects wrong password for existing user', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'login2@example.com', password: 'Password123!', name: 'Login Two' });
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'login2@example.com', password: 'WrongPass1!' });
    expect(res.status).toBe(401);
  });

  test('refresh rotates tokens (old refresh is single-use)', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'refresh1@example.com', password: 'Password123!', name: 'Refresh One' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'refresh1@example.com', password: 'Password123!' });
    const first = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toBeDefined();
    const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(replay.status).toBe(401);
  });

  test('logout revokes refresh token', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'logout1@example.com', password: 'Password123!', name: 'Logout One' });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'logout1@example.com', password: 'Password123!' });
    const out = await request(app).post('/api/v1/auth/logout').send({ refreshToken: login.body.refreshToken });
    expect(out.status).toBe(204);
    const after = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(after.status).toBe(401);
  });

  test('/me returns current user with valid token', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'me1@example.com', password: 'Password123!', name: 'Me One' });
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'me1@example.com', password: 'Password123!' });
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me1@example.com');
  });

  test('/me rejects missing token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  test('password is stored hashed, never plaintext', async () => {
    const { db } = await import('../src/db/pool');
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hash1@example.com', password: 'Password123!', name: 'Hash One' });
    const rows = await db.query(`SELECT password_hash FROM users WHERE email = $1`, ['hash1@example.com']);
    const hash = (rows.rows[0] as { password_hash: string }).password_hash;
    expect(hash).toBeDefined();
    expect(hash).not.toContain('Password123!');
    expect(hash.startsWith('$2')).toBe(true);
  });
});
