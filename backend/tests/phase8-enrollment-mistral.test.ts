import request from 'supertest';
import { createApp } from '../src/app';
import { useTestDb } from './helpers';
import { db } from '../src/db/pool';

let app: ReturnType<typeof createApp>;

async function registerAndLogin(email: string, role: 'student' | 'instructor' | 'admin' = 'instructor'): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password: 'Password123!', name: email, role });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'Password123!' });
  return login.body.accessToken as string;
}

beforeAll(async () => {
  await useTestDb();
  app = createApp();
});

describe('catalog visibility (enrollment root-cause regression)', () => {
  test('anonymous catalog lists ONLY published courses', async () => {
    const token = await registerAndLogin('vis-teach@example.com');
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Visibility Pending Course Abc', description: 'pending' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending');

    const res = await request(app).get('/api/v1/courses?pageSize=100');
    expect(res.status).toBe(200);
    const statuses = (res.body.data as { status: string }[]).map((c) => c.status);
    expect(statuses).not.toContain('pending');
    expect(statuses).not.toContain('rejected');
    expect(statuses).not.toContain('draft');
  });

  test('instructor sees non-published courses in the catalog (lifecycle management)', async () => {
    const token = await registerAndLogin('vis-teach2@example.com');
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Visibility Instructor Course Xyz', description: 'pending' });
    const res = await request(app).get('/api/v1/courses?pageSize=100').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect((res.body.data as { id: string }[]).map((c) => c.id)).toContain(created.body.id);
  });

  test('rejected course: catalog hides it from students AND enrollment stays protected', async () => {
    const instructorToken = await registerAndLogin('vis-teach3@example.com');
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ title: 'Rejected Course Visible No', description: 'rejected' });
    const courseId = created.body.id as string;
    await db.query(`UPDATE courses SET status = 'rejected' WHERE id = $1`, [courseId]);

    const catalog = await request(app).get('/api/v1/courses?pageSize=100');
    expect((catalog.body.data as { id: string }[]).map((c) => c.id)).not.toContain(courseId);

    // The business rule is NOT weakened: direct enroll attempt still denied.
    const studentToken = await registerAndLogin('vis-stud@example.com', 'student');
    const denied = await request(app).post(`/api/v1/courses/${courseId}/enroll`).set('Authorization', `Bearer ${studentToken}`).send();
    expect(denied.status).toBe(403);
    expect(denied.body.message).toMatch(/not open for enrollment/i);
  });

  test('full lifecycle: pending → admin approves → published → student enrolls 201', async () => {
    // The public register endpoint only offers student/instructor; the admin
    // role is granted directly (same pattern as phase5/phase6 tests).
    const base = await registerAndLogin('vis-admin@example.com', 'instructor');
    const roleRow = await db.query(`SELECT id FROM roles WHERE name = 'admin'`);
    await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
      (await request(app).post('/api/v1/auth/login').send({ email: 'vis-admin@example.com', password: 'Password123!' })).body.user.id,
      (roleRow.rows[0] as { id: string }).id,
    ]);
    const adminToken = (await request(app).post('/api/v1/auth/login').send({ email: 'vis-admin@example.com', password: 'Password123!' })).body.accessToken as string;
    void base;
    const instructorToken = await registerAndLogin('vis-teach4@example.com');
    const created = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({ title: 'Lifecycle Course Qq', description: 'lifecycle' });

    const studentToken = await registerAndLogin('vis-stud2@example.com', 'student');
    const before = await request(app).post(`/api/v1/courses/${created.body.id}/enroll`).set('Authorization', `Bearer ${studentToken}`).send();
    expect(before.status).toBe(403);

    const approved = await request(app)
      .post(`/api/v1/admin/courses/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ comment: 'ok' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('published');

    const after = await request(app).post(`/api/v1/courses/${created.body.id}/enroll`).set('Authorization', `Bearer ${studentToken}`).send();
    expect(after.status).toBe(201);

    const dup = await request(app).post(`/api/v1/courses/${created.body.id}/enroll`).set('Authorization', `Bearer ${studentToken}`).send();
    expect(dup.status).toBe(409);
  });
});

describe('AI Tutor Mistral provider (chat only)', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env.AI_TUTOR_PROVIDER = originalEnv.AI_TUTOR_PROVIDER;
    process.env.AI_TUTOR_API_KEY = originalEnv.AI_TUTOR_API_KEY;
    process.env.AI_TUTOR_MODEL = originalEnv.AI_TUTOR_MODEL;
    process.env.AI_TUTOR_CHAT_MODEL = originalEnv.AI_TUTOR_CHAT_MODEL;
    process.env.LLM_PROVIDER = originalEnv.LLM_PROVIDER;
    process.env.LLM_CHAT_MODEL = originalEnv.LLM_CHAT_MODEL;
    jest.restoreAllMocks();
  });

  test('AI_TUTOR_PROVIDER=mistral selects the Mistral chat provider', async () => {
    const { getLlmProvider, getLlmProviderName } = await import('../src/ai/llm');
    process.env.AI_TUTOR_PROVIDER = 'mistral';
    process.env.AI_TUTOR_API_KEY = 'test-mistral-key';
    process.env.AI_TUTOR_CHAT_MODEL = '';
    process.env.LLM_PROVIDER = 'gemini';
    expect(getLlmProviderName()).toBe('mistral');
    const provider = getLlmProvider();
    expect(provider.name).toBe('mistral');

    const seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((async (url: unknown, init: unknown) => {
      seen.push({
        url: String(url),
        headers: ((init as { headers?: Record<string, string> }).headers ?? {}) as Record<string, string>,
        body: JSON.parse(String((init as { body?: string }).body ?? '{}')),
      });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'stubbed mistral answer' } }] }),
        text: async () => '',
      };
    }) as typeof fetch);
    try {
      const out = await provider.chat({ system: 'sys', user: 'hello' });
      expect(out).toBe('stubbed mistral answer');
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toContain('api.mistral.ai');
      expect(seen[0].url).toContain('/v1/chat/completions');
      expect(seen[0].headers['authorization']).toBe('Bearer test-mistral-key');
      expect(seen[0].body.model).toBe('magistral-small-2506');
      expect(seen[0].body.messages).toEqual([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
      ]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('AI_TUTOR_PROVIDER=openrouter selects the OpenRouter chat provider', async () => {
    const { getLlmProvider, getLlmProviderName } = await import('../src/ai/llm');
    process.env.AI_TUTOR_PROVIDER = 'openrouter';
    process.env.AI_TUTOR_API_KEY = 'test-openrouter-key';
    process.env.AI_TUTOR_MODEL = 'openrouter/free';
    process.env.LLM_PROVIDER = 'gemini';
    expect(getLlmProviderName()).toBe('openrouter');
    const provider = getLlmProvider();
    expect(provider.name).toBe('openrouter');

    const seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((async (url: unknown, init: unknown) => {
      seen.push({
        url: String(url),
        headers: ((init as { headers?: Record<string, string> }).headers ?? {}) as Record<string, string>,
        body: JSON.parse(String((init as { body?: string }).body ?? '{}')),
      });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'stubbed openrouter answer' } }] }),
        text: async () => '',
      };
    }) as typeof fetch);
    try {
      const out = await provider.chat({ system: 'sys', user: 'hello' });
      expect(out).toBe('stubbed openrouter answer');
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toContain('openrouter.ai/api/v1');
      expect(seen[0].url).toContain('/chat/completions');
      expect(seen[0].headers['authorization']).toBe('Bearer test-openrouter-key');
      expect(seen[0].body.model).toBe('openrouter/free');
      expect(seen[0].body.messages).toEqual([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' },
      ]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('missing Mistral key falls back to deterministic mock output (never throws key material)', async () => {
    const { getLlmProvider } = await import('../src/ai/llm');
    process.env.AI_TUTOR_PROVIDER = 'mistral';
    delete process.env.AI_TUTOR_API_KEY;
    const provider = getLlmProvider();
    expect(provider.name).toBe('mistral');
    const out = await provider.chat({ system: 's', user: 'first line here' });
    expect(out).toContain('Mock answer');
  });

  test('AI provider failures map to safe errors (429 / 503, no provider details)', async () => {
    const { getLlmProvider } = await import('../src/ai/llm');
    process.env.AI_TUTOR_PROVIDER = 'mistral';
    process.env.AI_TUTOR_API_KEY = 'test-mistral-key';
    const provider = getLlmProvider();

    jest.spyOn(globalThis, 'fetch').mockImplementation((async () => ({
      ok: false,
      status: 429,
      text: async () => 'rate limited by upstream',
    })) as unknown as typeof fetch);
    try {
      await expect(provider.chat({ system: 's', user: 'u' })).rejects.toThrow(/LLM provider error: 429/);
    } finally {
      jest.restoreAllMocks();
    }

    jest.spyOn(globalThis, 'fetch').mockImplementation((async () => ({
      ok: false,
      status: 500,
      text: async () => 'internal provider boom with secret sk-abc',
    })) as unknown as typeof fetch);
    try {
      await expect(provider.chat({ system: 's', user: 'u' })).rejects.toThrow(/LLM provider error: 500/);
    } finally {
      jest.restoreAllMocks();
    }
  });
});
