import request from 'supertest';
import { createApp } from '../src/app';
import { CACHE_TTL, resetCacheForTests } from '../src/cache/courseCache';
import { resetRateLimitsForTests } from '../src/middleware/rateLimit';
import { enqueueJob, getJobLog, pendingJobCount, processNextJob, registerDefaultJobHandlers, resetJobsForTests } from '../src/jobs/queue';
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

beforeEach(() => {
  resetCacheForTests();
  resetRateLimitsForTests();
  resetJobsForTests();
});

describe('Phase 7 Redis caching', () => {
  test('catalog: first MISS then HIT, and TTL configured', async () => {
    expect(CACHE_TTL.catalog).toBeGreaterThan(0);
    const first = await request(app).get('/api/v1/courses?page=1&pageSize=5');
    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    const second = await request(app).get('/api/v1/courses?page=1&pageSize=5');
    expect(second.status).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));
  });

  test('course metadata: MISS then HIT', async () => {
    expect(CACHE_TTL.courseMeta).toBeGreaterThan(0);
    const token = await registerAndLogin('cache-meta@example.com');
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Cache Meta Course', description: 'meta' });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const first = await request(app).get(`/api/v1/courses/${id}`);
    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    const second = await request(app).get(`/api/v1/courses/${id}`);
    expect(second.headers['x-cache']).toBe('HIT');
  });

  test('invalidation: course update busts catalog + metadata cache', async () => {
    const token = await registerAndLogin('cache-inval@example.com');
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Invalidation Course', description: 'v1' });
    const id = created.body.id as string;
    await request(app).get('/api/v1/courses?page=1&pageSize=50');
    await request(app).get(`/api/v1/courses/${id}`);
    // Prime done (HIT expected now); update the course.
    const primed = await request(app).get(`/api/v1/courses/${id}`);
    expect(primed.headers['x-cache']).toBe('HIT');
    const updated = await request(app)
      .put(`/api/v1/courses/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Invalidation Course v2' });
    expect(updated.status).toBe(200);
    const after = await request(app).get(`/api/v1/courses/${id}`);
    expect(after.headers['x-cache']).toBe('MISS');
  });

  test('leaderboard: MISS then HIT with TTL', async () => {
    expect(CACHE_TTL.leaderboard).toBeGreaterThan(0);
    const first = await request(app).get('/api/v1/gamification/leaderboard?limit=5');
    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(Array.isArray(first.body.data)).toBe(true);
    const second = await request(app).get('/api/v1/gamification/leaderboard?limit=5');
    expect(second.headers['x-cache']).toBe('HIT');
  });
});

describe('Phase 7 background jobs', () => {
  test('enqueue is idempotent via idempotency keys', async () => {
    const first = await enqueueJob('notification-dispatch', { userId: 'u1' }, { idempotencyKey: 'k-1' });
    const second = await enqueueJob('notification-dispatch', { userId: 'u1' }, { idempotencyKey: 'k-1' });
    expect(first.enqueued).toBe(true);
    expect(second.deduplicated).toBe(true);
    expect(pendingJobCount('notification-dispatch')).toBe(1);
  });

  test('jobs log status and handle failure with retry', async () => {
    registerDefaultJobHandlers({
      onNotification: async () => {
        throw new Error('smtp down');
      },
    });
    await enqueueJob('notification-dispatch', { userId: 'u2' }, { idempotencyKey: 'k-fail' });
    await processNextJob('notification-dispatch');
    const log = getJobLog();
    expect(log.length).toBe(1);
    expect(log[0].status).toBe('failed');
    // Failed with attempts < max → requeued.
    expect(pendingJobCount('notification-dispatch')).toBe(1);
  });

  test('job payloads must not contain secrets', async () => {
    await expect(enqueueJob('notification-dispatch', { token: 'BEGIN RSA PRIVATE KEY xyz' } as unknown as Record<string, unknown>)).rejects.toThrow();
  });

  test('all six job kinds enqueue', async () => {
    const kinds = ['document-ingest', 'video-transcribe', 'certificate-generate', 'notification-dispatch', 'recommendation-recalc', 'streak-process'] as const;
    for (const [i, kind] of kinds.entries()) {
      const r = await enqueueJob(kind, { ref: `r-${i}` }, { idempotencyKey: `k-${kind}` });
      expect(r.enqueued).toBe(true);
    }
    expect(pendingJobCount()).toBe(6);
  });
});

describe('Phase 7 rate limiting', () => {
  test('auth limiter allows under limit and blocks over (10/min/IP)', async () => {
    process.env.RATE_LIMIT_ENFORCE = '1';
    try {
      const { authRateLimit } = await import('../src/middleware/rateLimit');
      const express = (await import('express')).default;
      const tiny = express();
      tiny.use(authRateLimit(60_000, 2));
      tiny.post('/login', (_req, res) => res.json({ ok: true }));
      const agent = request(tiny);
      expect((await agent.post('/login').send({})).status).toBe(200);
      expect((await agent.post('/login').send({})).status).toBe(200);
      const blocked = await agent.post('/login').send({});
      expect(blocked.status).toBe(429);
      expect(blocked.body.error).toBe('RATE_LIMITED');
      expect(blocked.headers['ratelimit-limit']).toBe('2');
    } finally {
      delete process.env.RATE_LIMIT_ENFORCE;
    }
  });

  test('AI limiter blocks over 20/min/user equivalent', async () => {
    process.env.RATE_LIMIT_ENFORCE = '1';
    try {
      const { aiRateLimit } = await import('../src/middleware/rateLimit');
      const express = (await import('express')).default;
      const tiny = express();
      tiny.use(aiRateLimit(60_000, 2));
      tiny.post('/ai/chat', (_req, res) => res.json({ ok: true }));
      const agent = request(tiny);
      await agent.post('/ai/chat').send({});
      await agent.post('/ai/chat').send({});
      const blocked = await agent.post('/ai/chat').send({});
      expect(blocked.status).toBe(429);
    } finally {
      delete process.env.RATE_LIMIT_ENFORCE;
    }
  });

  test('authenticated limiter resets after window', async () => {
    process.env.RATE_LIMIT_ENFORCE = '1';
    try {
      const { authenticatedRateLimit } = await import('../src/middleware/rateLimit');
      const express = (await import('express')).default;
      const tiny = express();
      tiny.use(authenticatedRateLimit(50, 1));
      tiny.get('/me', (_req, res) => res.json({ ok: true }));
      const agent = request(tiny);
      expect((await agent.get('/me')).status).toBe(200);
      expect((await agent.get('/me')).status).toBe(429);
      await new Promise((r) => setTimeout(r, 60));
      expect((await agent.get('/me')).status).toBe(200);
    } finally {
      delete process.env.RATE_LIMIT_ENFORCE;
    }
  });
});
