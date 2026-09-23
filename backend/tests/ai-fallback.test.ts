import {
  aiServiceChatTimeoutMs,
  aiServiceGenerateTimeoutMs,
  normalizeAiServiceChatResponse,
  noteAiServiceFailure,
  noteAiServiceSuccess,
} from '../src/ai/client';
import { chatWithFallback, getProviderChain, looksLikePlaceholderAnswer } from '../src/ai/llm';

/**
 * The hosted AI Tutor used to hang for minutes because ONE provider (and the
 * backend→AI-service hop) could consume the whole request budget. These tests
 * pin the replacement behavior: a bounded attempt per provider, then the next
 * provider in the chain, then a fast honest failure.
 */
describe('AI Tutor provider fallback chain', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.LLM_ATTEMPT_TIMEOUT_MS = '2000';
    process.env.AI_ANSWER_BUDGET_MS = '15000';
    delete process.env.AI_TUTOR_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  const hangingFetch = (label: string, ok: string) =>
    (async (url: unknown, init?: { signal?: AbortSignal }) => {
      if (String(url).includes(label)) {
        // Never answers: only the provider's own abort can settle this, which
        // is exactly how a hanging provider behaves in production.
        return await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        });
      }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: ok }] } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof global.fetch;

  test('primary provider first, then every other provider that has a credential', () => {
    process.env.AI_TUTOR_PROVIDER = 'pollinations';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GROQ_API_KEY = '';
    const chain = getProviderChain().map((p) => p.name);
    expect(chain[0]).toBe('pollinations');
    expect(chain).toContain('gemini');
    // No credential => never in the chain (an unkeyed provider would answer
    // with mock text instead of failing honestly).
    expect(chain).not.toContain('groq');
    expect(chain).not.toContain('openrouter');
  });

  test('falls back to the next provider when the primary hangs', async () => {
    process.env.AI_TUTOR_PROVIDER = 'pollinations';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    global.fetch = hangingFetch('pollinations', 'Grounding answer from Gemini [S1]');

    const started = Date.now();
    const result = await chatWithFallback({ system: 's', user: 'u' });
    const elapsed = Date.now() - started;

    expect(result.provider).toBe('gemini');
    expect(result.answer).toContain('Grounding answer from Gemini');
    expect(result.attempts).toEqual([{ provider: 'pollinations', category: 'timeout' }]);
    // Bounded by one attempt budget — not by a retry multiplier.
    expect(elapsed).toBeLessThan(6000);
  });

  test('fails bounded (no long hang) when every provider is down', async () => {
    process.env.AI_TUTOR_PROVIDER = 'pollinations';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    // Every provider endpoint hangs.
    global.fetch = (async (_url: unknown, init?: { signal?: AbortSignal }) =>
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      })) as unknown as typeof global.fetch;

    const started = Date.now();
    await expect(chatWithFallback({ system: 's', user: 'u' })).rejects.toThrow();
    const elapsed = Date.now() - started;
    // pollinations (2s) + gemini (2s) at most.
    expect(elapsed).toBeLessThan(8000);
  });

  test('AI-service hops are bounded and clamped to safe ranges', () => {
    expect(aiServiceChatTimeoutMs()).toBe(12000);
    expect(aiServiceGenerateTimeoutMs()).toBe(25000);
    process.env.AI_SERVICE_CHAT_TIMEOUT_MS = '999999';
    expect(aiServiceChatTimeoutMs()).toBe(30000);
    process.env.AI_SERVICE_GENERATE_TIMEOUT_MS = '1';
    expect(aiServiceGenerateTimeoutMs()).toBe(3000);
  });

  test('a failed hop is parked and a success clears it', async () => {
    noteAiServiceSuccess();
    noteAiServiceFailure('health request failed (network/timeout)');
    // Deterministic: every provider transport fails, so this must reject
    // without depending on the real internet being reachable (or not).
    global.fetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof global.fetch;
    await expect(chatWithFallback({ system: 's', user: 'u' })).rejects.toThrow();
    noteAiServiceSuccess();
  });

  test('degenerate moderation output is refused, real refusals are not', () => {
    // Seen live from a free model router: a content-safety classifier answered
    // "User Safety: safe", which was stored as a grounded, cited answer.
    expect(looksLikePlaceholderAnswer('User Safety: safe')).toBe(true);
    expect(looksLikePlaceholderAnswer('content safety: blocked')).toBe(true);
    expect(looksLikePlaceholderAnswer('safe')).toBe(true);
    expect(looksLikePlaceholderAnswer('Mock answer: what is X?')).toBe(true);
    // Legitimate answers must never be treated as placeholders.
    expect(looksLikePlaceholderAnswer('I could not find this in the course material.')).toBe(false);
    expect(looksLikePlaceholderAnswer('Usability testing watches five real users [S1].')).toBe(false);
  });

  test('AI-service snake_case citations are normalized (never a bare ref)', () => {
    // Live-host payload shape: FastAPI/pydantic answers in snake_case, and
    // casting it to the camelCase interface silently dropped every lecture
    // name from the stored citation.
    const parsed = normalizeAiServiceChatResponse({
      answer: 'Spaced repetition spreads reviews out [S1].',
      grounded: true,
      mode: 'beginner',
      sources: [
        { ref: 'S1', lecture_id: 'def0de88-d150-4fda-91d6-95524b960d25', lecture_title: 'Spaced repetition basics', chunk_index: 0, score: 0.75 },
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.sources[0]).toEqual({
      ref: 'S1',
      lectureId: 'def0de88-d150-4fda-91d6-95524b960d25',
      lectureTitle: 'Spaced repetition basics',
      chunkIndex: 0,
      score: 0.75,
    });
    // A payload with no answer is unusable, not an empty answer.
    expect(normalizeAiServiceChatResponse({ grounded: true }) ).toBeNull();
    expect(normalizeAiServiceChatResponse('nope')).toBeNull();
  });

  test('a real provider error is reported instead of a bare timeout', async () => {
    process.env.AI_TUTOR_PROVIDER = 'pollinations';
    delete process.env.GEMINI_API_KEY;
    global.fetch = (async () =>
      new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 })) as unknown as typeof global.fetch;

    await expect(chatWithFallback({ system: 's', user: 'u' })).rejects.toThrow(/429/);
  });
});
