import http from 'node:http';
import { AddressInfo } from 'node:net';
import { deterministicEmbedding, getEmbeddingProvider, validateEmbeddingDim } from '../src/ai/embeddings';
import { useTestDb } from './helpers';
import { db, newId } from '../src/db/pool';

beforeAll(async () => {
  await useTestDb();
});

afterEach(() => {
  delete process.env.EMBEDDING_API_KEY;
  delete process.env.EMBEDDING_MODEL;
  delete process.env.EMBEDDING_BASE_URL;
  delete process.env.LLM_API_KEY;
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_CHAT_MODEL;
  delete process.env.LLM_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_CHAT_MODEL;
  delete process.env.GROQ_BASE_URL;
  // AI Tutor override vars (host .env may carry real values — keep tests hermetic)
  delete process.env.AI_TUTOR_PROVIDER;
  delete process.env.AI_TUTOR_API_KEY;
  delete process.env.AI_TUTOR_CHAT_MODEL;
  delete process.env.AI_TUTOR_BASE_URL;
  jest.restoreAllMocks();
});

describe('FINAL empty-env regression (live-verification blocker fix)', () => {
  test('empty LLM_BASE_URL falls back to https://api.anthropic.com (no relative URL)', async () => {
    const { getLlmProvider } = await import('../src/ai/llm');
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.LLM_API_KEY = 'test-key-not-real';
    process.env.LLM_BASE_URL = '';
    process.env.LLM_CHAT_MODEL = '';
    const seen: string[] = [];
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((async (url: unknown) => {
      seen.push(String(url));
      return {
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'stubbed' }] }),
        text: async () => '',
      };
    }) as typeof fetch);
    try {
      const out = await getLlmProvider().chat({ system: 's', user: 'u' });
      expect(out).toBe('stubbed');
      expect(seen).toHaveLength(1);
      expect(seen[0]).toBe('https://api.anthropic.com/v1/messages');
      const payload = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body ?? '{}')) as { model: string };
      expect(payload.model).toBe('claude-3-5-sonnet-latest');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('Anthropic LLM key alone never enables Voyage embeddings (no wrong-key 401)', async () => {
    process.env.LLM_API_KEY = 'sk-ant-test-not-real';
    delete process.env.EMBEDDING_API_KEY;
    delete process.env.EMBEDDING_MODEL;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not call HTTP'));
    try {
      const provider = getEmbeddingProvider();
      expect(provider.name).not.toBe('voyage');
      const [vec] = await provider.embed(['hello']);
      expect(vec).toHaveLength(1536);
      expect(vec).toEqual(deterministicEmbedding('hello', 1536));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('Phase 7 real embedding provider wiring (stub HTTP, no paid calls)', () => {
  test('without a key the provider falls back to deterministic 1536-dim vectors', async () => {
    const provider = getEmbeddingProvider();
    const [vec] = await provider.embed(['hello world']);
    expect(vec).toHaveLength(1536);
    expect(vec).toEqual(deterministicEmbedding('hello world', 1536));
  });

  test('with key+model the Voyage-compatible HTTP path returns validated vectors', async () => {
    const dim = 1536;
    const server = http.createServer((req, res) => {
      expect(req.url).toBe('/v1/embeddings');
      expect(req.headers.authorization).toBe('Bearer test-key');
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const parsed = JSON.parse(body) as { model: string; input: string[] };
        expect(parsed.model).toBe('voyage-3-lite');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ data: parsed.input.map(() => ({ embedding: new Array(dim).fill(0.01) })) }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    process.env.EMBEDDING_API_KEY = 'test-key';
    process.env.EMBEDDING_MODEL = 'voyage-3-lite';
    process.env.EMBEDDING_BASE_URL = `http://localhost:${port}`;
    try {
      const provider = getEmbeddingProvider();
      expect(provider.name).toBe('voyage');
      const vectors = await provider.embed(['alpha', 'beta']);
      expect(vectors).toHaveLength(2);
      for (const v of vectors) expect(v).toHaveLength(1536);
    } finally {
      server.close();
    }
  });

  test('dimension mismatch from the provider raises before any pgvector insert', async () => {
    const server = http.createServer((_req, res) => {
      let body = '';
      _req.on('data', (c) => (body += c));
      _req.on('end', () => {
        const parsed = JSON.parse(body) as { input: string[] };
        res.setHeader('content-type', 'application/json');
        // Wrong dim on purpose.
        res.end(JSON.stringify({ data: parsed.input.map(() => ({ embedding: [0.1, 0.2, 0.3] })) }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    process.env.EMBEDDING_API_KEY = 'test-key';
    process.env.EMBEDDING_MODEL = 'voyage-3-lite';
    process.env.EMBEDDING_BASE_URL = `http://localhost:${port}`;
    try {
      const provider = getEmbeddingProvider();
      await expect(provider.embed(['alpha'])).rejects.toThrow(/dimension mismatch/i);
    } finally {
      server.close();
    }
  });

  test('validateEmbeddingDim rejects wrong dims and non-finite values', () => {
    expect(() => validateEmbeddingDim(new Array(1536).fill(0))).not.toThrow();
    expect(() => validateEmbeddingDim([1, 2, 3])).toThrow(/dimension mismatch/i);
    expect(() => validateEmbeddingDim(new Array(1536).fill(Number.NaN))).toThrow(/non-finite/i);
  });

  test('ingestTranscript validates dims before inserting (grounded RAG path)', async () => {
    const { setEmbeddingProviderForTests } = await import('../src/ai/embeddings');
    const { ingestTranscript, retrieveCourseChunks } = await import('../src/ai/retriever');
    // Seed minimal course/module/lecture rows for FK integrity.
    const courseId = newId();
    const instructorRes = await db.query(`SELECT id FROM users LIMIT 1`);
    let instructorId = (instructorRes.rows[0] as { id: string } | undefined)?.id;
    if (!instructorId) {
      instructorId = newId();
      await db.query(`INSERT INTO users (id, email, password_hash, name) VALUES ($1, 'rag-inst@example.com', 'x', 'RAG')`, [instructorId]);
      const roleRes = await db.query(`SELECT id FROM roles WHERE name = 'instructor'`);
      await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [instructorId, (roleRes.rows[0] as { id: string }).id]);
    }
    await db.query(`INSERT INTO courses (id, instructor_id, title, description, status) VALUES ($1, $2, 'RAG Course', '', 'published')`, [courseId, instructorId]);
    const moduleId = newId();
    await db.query(`INSERT INTO modules (id, course_id, title, sort_order) VALUES ($1, $2, 'M1', 0)`, [moduleId, courseId]);
    const lectureId = newId();
    await db.query(`INSERT INTO lectures (id, module_id, title, sort_order) VALUES ($1, $2, 'L1', 0)`, [lectureId, moduleId]);
    setEmbeddingProviderForTests(undefined);
    const chunks = await ingestTranscript(courseId, lectureId, 'Photosynthesis converts light into chemical energy. Chlorophyll absorbs sunlight in leaves.');
    expect(chunks).toBeGreaterThan(0);
    const hits = await retrieveCourseChunks(courseId, 'What is photosynthesis?', 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text.toLowerCase()).toContain('photosynthesis');
    setEmbeddingProviderForTests(undefined);
  });
});

describe('FINAL Gemini free-tier providers (stub HTTP, no live calls)', () => {
  test('LLM_PROVIDER=gemini selects Gemini and calls :generateContent (no Anthropic)', async () => {
    const { getLlmProvider } = await import('../src/ai/llm');
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.LLM_CHAT_MODEL = 'gemini-2.5-flash';
    const seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((async (url: unknown, init: unknown) => {
      const headers = ((init as { headers?: Record<string, string> }).headers ?? {}) as Record<string, string>;
      seen.push({ url: String(url), headers, body: JSON.parse(String((init as { body?: string }).body ?? '{}')) });
      return {
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'stubbed gemini answer' }] } }] }),
        text: async () => '',
      };
    }) as typeof fetch);
    try {
      const provider = getLlmProvider();
      expect(provider.name).toBe('gemini');
      const out = await provider.chat({ system: 'sys', user: 'hello' });
      expect(out).toBe('stubbed gemini answer');
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toContain(':generateContent');
      expect(seen[0].url).toContain('gemini-2.5-flash');
      expect(seen[0].url).not.toContain('anthropic');
      expect(seen[0].headers['x-goog-api-key']).toBe('test-gemini-key');
      expect(seen[0].headers).not.toHaveProperty('x-api-key');
    } finally {
      fetchSpy.mockRestore();
      delete process.env.GEMINI_API_KEY;
    }
  });

  test('gemini-embedding-001 requests 1536 dims and validates them', async () => {
    process.env.EMBEDDING_MODEL = 'gemini-embedding-001';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    delete process.env.EMBEDDING_API_KEY;
    const seen: { url: string; body: Record<string, unknown> }[] = [];
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((async (url: unknown, init: unknown) => {
      seen.push({ url: String(url), body: JSON.parse(String((init as { body?: string }).body ?? '{}')) });
      return {
        ok: true,
        json: async () => ({ embedding: { values: new Array(1536).fill(0.01) } }),
        text: async () => '',
      };
    }) as typeof fetch);
    try {
      const provider = getEmbeddingProvider();
      expect(provider.name).toBe('gemini');
      const [vec] = await provider.embed(['hello world']);
      expect(vec).toHaveLength(1536);
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toContain(':embedContent');
      expect((seen[0].body as { outputDimensionality?: number }).outputDimensionality).toBe(1536);
      expect((seen[0].body as { model?: string }).model).toContain('gemini-embedding-001');
    } finally {
      fetchSpy.mockRestore();
      delete process.env.GEMINI_API_KEY;
    }
  });

  test('Voyage routing preserved when explicitly configured', async () => {
    process.env.EMBEDDING_MODEL = 'voyage-3-lite';
    process.env.EMBEDDING_API_KEY = 'test-voyage-key';
    delete process.env.GEMINI_API_KEY;
    try {
      expect(getEmbeddingProvider().name).toBe('voyage');
    } finally {
      delete process.env.EMBEDDING_API_KEY;
    }
  });
});

describe('FINAL Groq AI Tutor provider (stub HTTP, no live calls)', () => {
  test('AI_TUTOR_PROVIDER=groq calls the Groq OpenAI-compatible endpoint', async () => {
    const { getLlmProvider } = await import('../src/ai/llm');
    process.env.AI_TUTOR_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.GROQ_CHAT_MODEL = 'llama-3.3-70b-versatile';
    const seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((async (url: unknown, init: unknown) => {
      const headers = ((init as { headers?: Record<string, string> }).headers ?? {}) as Record<string, string>;
      seen.push({ url: String(url), headers, body: JSON.parse(String((init as { body?: string }).body ?? '{}')) });
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'stubbed groq answer' } }] }),
        text: async () => '',
      };
    }) as typeof fetch);
    try {
      const provider = getLlmProvider();
      expect(provider.name).toBe('groq');
      const out = await provider.chat({ system: 'sys', user: 'hello' });
      expect(out).toBe('stubbed groq answer');
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(seen[0].headers.authorization).toBe('Bearer test-groq-key');
      expect((seen[0].body as { model?: string }).model).toBe('llama-3.3-70b-versatile');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('groq without a key falls back to mock output (never calls HTTP)', async () => {
    const { getLlmProvider } = await import('../src/ai/llm');
    process.env.AI_TUTOR_PROVIDER = 'groq';
    delete process.env.GROQ_API_KEY;
    delete process.env.AI_TUTOR_API_KEY;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not call HTTP'));
    try {
      const out = await getLlmProvider().chat({ system: 'sys', user: 'hello' });
      expect(out).toContain('Mock answer');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('groq 401 fails fast without retry (auth error, not transient)', async () => {
    const { getLlmProvider } = await import('../src/ai/llm');
    process.env.AI_TUTOR_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'bad-key';
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((async () => ({
      ok: false,
      status: 401,
      text: async () => 'invalid api key',
    })) as unknown as typeof fetch);
    try {
      await expect(getLlmProvider().chat({ system: 'sys', user: 'hello' })).rejects.toThrow(/LLM provider error: 401/);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
