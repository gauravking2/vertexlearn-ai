import { getConfig } from '../config';

export function aiServiceBaseUrl(): string {
  try {
    const url = (getConfig() as unknown as { AI_SERVICE_URL?: string }).AI_SERVICE_URL;
    if (url) return url;
  } catch {
    /* config not loaded in some unit tests */
  }
  return process.env.AI_SERVICE_URL ?? '';
}

export function aiServiceToken(): string {
  try {
    const token = (getConfig() as unknown as { AI_SERVICE_TOKEN?: string }).AI_SERVICE_TOKEN;
    if (token) return token;
  } catch {
    /* ignore */
  }
  return process.env.AI_SERVICE_TOKEN ?? '';
}

export function isAiServiceConfigured(): boolean {
  return Boolean(aiServiceBaseUrl());
}

/**
 * Why the configured AI_SERVICE_URL cannot be used, or '' when it looks usable.
 *
 * A private-network host (`*.railway.internal`) is only reachable on the port
 * the target process actually listens on, and nothing defaults it: a URL with
 * no port silently targets port 80, so every call dies in a few hundred
 * milliseconds with a connection error that reads like "the AI service is
 * down" while the service itself is healthy and answering /health publicly.
 * Naming the problem turns a long debugging session into one line on
 * /courses/:id/ai-status.
 */
export function aiServiceUrlProblem(base: string = aiServiceBaseUrl()): string {
  if (!base) return 'not-configured';
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return 'not-a-url';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'unsupported-protocol';
  if (url.hostname.endsWith('.railway.internal') && !url.port) return 'private-host-without-port';
  return '';
}

export function isAiServiceUrlUsable(base: string = aiServiceBaseUrl()): boolean {
  return aiServiceUrlProblem(base) === '';
}

/**
 * Budget for ONE backend→AI-service chat request.
 *
 * A warm AI service answers in ~1-3s and a cold free-tier instance needs
 * 30-60s, which the separate /ai/warmup ping already covers in the
 * background. Waiting the old 100s inside the user's message is what produced
 * the "Waking AI Tutor…" hang: a broken or unreachable hop took the entire
 * request down with it. A short budget plus the breaker below means an
 * unhealthy hop is skipped within seconds and the local grounded path answers.
 */
export function aiServiceChatTimeoutMs(): number {
  const raw = Number(process.env.AI_SERVICE_CHAT_TIMEOUT_MS ?? NaN);
  if (!Number.isFinite(raw) || raw <= 0) return 12000;
  return Math.min(Math.max(Math.floor(raw), 2000), 30000);
}

/**
 * Budget for ONE backend→AI-service generation request (summarize, quiz
 * drafts, flashcards, study plan). These routes have local implementations to
 * fall back on, so a dead hop must fail fast instead of holding the request.
 */
export function aiServiceGenerateTimeoutMs(): number {
  const raw = Number(process.env.AI_SERVICE_GENERATE_TIMEOUT_MS ?? NaN);
  if (!Number.isFinite(raw) || raw <= 0) return 25000;
  return Math.min(Math.max(Math.floor(raw), 3000), 60000);
}

function aiServiceBreakerMs(): number {
  const raw = Number(process.env.AI_SERVICE_BREAKER_MS ?? NaN);
  if (!Number.isFinite(raw) || raw <= 0) return 120000;
  return Math.min(Math.max(Math.floor(raw), 5000), 900000);
}

/**
 * Circuit breaker for the backend→AI-service hop. One failure (a warmup ping
 * that never answers, or a chat request that times out) parks the hop for
 * AI_SERVICE_BREAKER_MS so every following message answers from the local
 * grounded path immediately instead of re-paying the same dead wait.
 */
let breakerOpenUntil = 0;
let breakerReason = '';

export function noteAiServiceFailure(reason: string): void {
  breakerOpenUntil = Date.now() + aiServiceBreakerMs();
  breakerReason = reason;
}

export function noteAiServiceSuccess(): void {
  breakerOpenUntil = 0;
  breakerReason = '';
}

export function isAiServiceBreakerOpen(): boolean {
  return Date.now() < breakerOpenUntil;
}

export function aiServiceHost(): string {
  const base = aiServiceBaseUrl();
  if (!base) return '';
  try {
    return new URL(base).host;
  } catch {
    return 'invalid AI_SERVICE_URL (not a URL)';
  }
}

export function aiServiceDiagnostics(): {
  configured: boolean;
  urlProblem: string;
  urlUsable: boolean;
  breakerOpen: boolean;
  breakerReason: string;
  chatBudgetMs: number;
  generateBudgetMs: number;
  pingBudgetMs: number;
} {
  const problem = aiServiceUrlProblem();
  return {
    configured: isAiServiceConfigured(),
    // Coarse category only — never the URL itself.
    urlProblem: problem,
    urlUsable: problem === '',
    breakerOpen: isAiServiceBreakerOpen(),
    breakerReason: isAiServiceBreakerOpen() ? breakerReason : '',
    chatBudgetMs: aiServiceChatTimeoutMs(),
    generateBudgetMs: aiServiceGenerateTimeoutMs(),
    pingBudgetMs: 60000,
  };
}

export function aiServiceTimeoutMs(): number {
  // Total budget for ONE backend→AI-service call. Cold starts on Render Free
  // can take 30-60s, and the Pollinations chat route answers in ~15-25s, so
  // the budget must cover retrieval + one genuine provider call with margin.
  // 100s stays under typical gateway limits while ending the "Waking AI
  // Tutor" hang permanently (failing calls now settle as errors instead of
  // hanging past the 140s client timeout). Never unbounded; retries are
  // handled by the caller.
  // Canonical source is AppConfig (AI_SERVICE_TIMEOUT_MS); direct env read is
  // the fallback for unit-test contexts where config is not loaded.
  let raw = Number(process.env.AI_SERVICE_TIMEOUT_MS ?? NaN);
  if (!Number.isFinite(raw) || raw <= 0) {
    try {
      raw = (getConfig() as unknown as { AI_SERVICE_TIMEOUT_MS?: number }).AI_SERVICE_TIMEOUT_MS ?? NaN;
    } catch {
      raw = NaN;
    }
  }
  if (!Number.isFinite(raw) || raw <= 0) return 100000;
  return Math.min(Math.max(Math.floor(raw), 5000), 120000);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

export interface AiServiceChatResponse {
  answer: string;
  grounded: boolean;
  sources: { ref: string; lectureId: string | null; lectureTitle: string; chunkIndex: number; score: number }[];
  mode: string;
}

/**
 * Normalize the AI service's chat payload into the backend's shape.
 *
 * The AI service (FastAPI/pydantic) answers with snake_case (`lecture_id`,
 * `lecture_title`, `chunk_index`, `top_k`), while this client consumes
 * camelCase. Casting the JSON straight to the interface type-checked fine but
 * left every remote citation without a lecture name in the host's database —
 * sources stored as `{ref, score}` only, so a student saw `[S1]` attached to
 * nothing. Accept both spellings and never emit an undefined field.
 */
export function normalizeAiServiceChatResponse(raw: unknown): AiServiceChatResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.answer !== 'string') return null;
  const rawSources = Array.isArray(body.sources) ? (body.sources as Record<string, unknown>[]) : [];
  const sources = rawSources.map((s, i) => {
    const pick = (...keys: string[]): unknown => {
      for (const k of keys) if (s[k] !== undefined && s[k] !== null) return s[k];
      return undefined;
    };
    const rawIndex = pick('chunkIndex', 'chunk_index');
    const rawScore = pick('score');
    return {
      ref: typeof s.ref === 'string' && s.ref ? s.ref : `S${i + 1}`,
      lectureId: (pick('lectureId', 'lecture_id') as string | null | undefined) ?? null,
      lectureTitle: (pick('lectureTitle', 'lecture_title') as string | undefined) ?? '',
      chunkIndex: Number.isFinite(Number(rawIndex)) ? Number(rawIndex) : 0,
      score: Number.isFinite(Number(rawScore)) ? Number(rawScore) : 0,
    };
  });
  return {
    answer: body.answer,
    grounded: body.grounded === true,
    sources,
    mode: typeof body.mode === 'string' ? body.mode : '',
  };
}

export async function pingAiService(timeoutMs = 15000): Promise<boolean> {
  const base = aiServiceBaseUrl();
  if (!base) return false;
  // Do not spend the budget on a hop that cannot resolve: a private-network
  // host with no port is a configuration error, and reporting it as an
  // unreachable service hides the fix.
  const problem = aiServiceUrlProblem(base);
  if (problem) {
    noteAiServiceFailure(`invalid AI_SERVICE_URL (${problem})`);
    return false;
  }
  const controller = new AbortController();
  // Cap matches the 60s warmup budget: a cold free-tier AI service needs
  // 30-60s to boot, and capping at 30s made warmup report warm:false even
  // when the service was waking normally (then chat paid the whole cold
  // boot inside its own budget and timed out).
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(timeoutMs, 1000), 60000));
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, {
      method: 'GET',
      headers: { ...(aiServiceToken() ? { 'x-ai-service-token': aiServiceToken() } : {}) },
      signal: controller.signal,
    });
    if (res.ok) {
      noteAiServiceSuccess();
      return true;
    }
    noteAiServiceFailure(`health responded ${res.status}`);
    return false;
  } catch (err) {
    noteAiServiceFailure(isColdStartError(err) ? 'health request failed (network/timeout)' : 'health request failed');
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function isColdStartError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /timed out|timeout|abort|fetch failed|network|ECONNRESET|ENOTFOUND|EAI_AGAIN|EPIPE/i.test(message);
}

export async function callAiServiceChatWithColdRetry(input: {
  courseId: string;
  question: string;
  mode: string;
  topK?: number;
}): Promise<AiServiceChatResponse | null> {
  // Render Free spins the AI service down after ~15min idle. A cold boot is
  // paid by the background /ai/warmup ping, NOT inside the user's message:
  // one short attempt against a warm, reachable hop, else the caller falls
  // back to the local grounded path. Skipped entirely while the breaker is
  // open.
  if (isAiServiceBreakerOpen()) {
    throw new Error('AI service skipped: circuit breaker open after a recent failure');
  }
  const problem = aiServiceUrlProblem();
  if (problem) {
    noteAiServiceFailure(`invalid AI_SERVICE_URL (${problem})`);
    throw new Error(`AI service URL is unusable (${problem})`);
  }
  try {
    const result = await callAiServiceChatInner(input);
    noteAiServiceSuccess();
    return result;
  } catch (err) {
    noteAiServiceFailure(isColdStartError(err) ? 'chat request failed (network/timeout)' : 'chat request failed');
    throw err;
  }
}

export async function callAiServiceChat(
  input: { courseId: string; question: string; mode: string; topK?: number },
): Promise<AiServiceChatResponse | null> {
  return callAiServiceChatWithColdRetry(input);
}

async function callAiServiceChatInner(input: {
  courseId: string;
  question: string;
  mode: string;
  topK?: number;
}): Promise<AiServiceChatResponse | null> {
  const base = aiServiceBaseUrl();
  if (!base) return null;
  const res = await withTimeout(
    fetch(`${base.replace(/\/$/, '')}/v1/chat/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(aiServiceToken() ? { 'x-ai-service-token': aiServiceToken() } : {}) },
      body: JSON.stringify({ course_id: input.courseId, question: input.question, mode: input.mode, top_k: input.topK ?? 5 }),
    }),
    aiServiceChatTimeoutMs(),
    'AI service chat',
  );
  if (!res.ok) {
    // Carry the ai-service coarse error code so the caller can map 429 /
    // AI_NOT_CONFIGURED / AI_BAD_REQUEST to safe user-facing categories.
    // Provider bodies are never included.
    const bodyText = await res.text().catch(() => '');
    let code = '';
    try {
      code = (JSON.parse(bodyText) as { error?: string }).error ?? '';
    } catch {
      code = '';
    }
    throw new Error(`AI service error: ${res.status}${code ? ` ${code}` : ''}`);
  }
  const parsed = normalizeAiServiceChatResponse(await res.json());
  // An unparseable body is an unusable answer: report it as a failed attempt
  // so the caller falls through to the local grounded path.
  if (!parsed) throw new Error('AI service returned an unusable chat payload');
  return parsed;
}

export async function callAiServiceGenerate<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = aiServiceBaseUrl();
  if (!base) throw new Error('AI service is not configured');
  // Same breaker as the chat hop: once the hop is known unhealthy these routes
  // fall through to their local implementations immediately.
  if (isAiServiceBreakerOpen()) {
    throw new Error('AI service skipped: circuit breaker open after a recent failure');
  }
  const problem = aiServiceUrlProblem(base);
  if (problem) throw new Error(`AI service URL is unusable (${problem})`);
  try {
    const res = await withTimeout(
      fetch(`${base.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(aiServiceToken() ? { 'x-ai-service-token': aiServiceToken() } : {}) },
        body: JSON.stringify(body),
      }),
      aiServiceGenerateTimeoutMs(),
      'AI service request',
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 5xx means the hop is sick; 4xx is a request problem and must not park it.
      if (res.status >= 500) noteAiServiceFailure(`generate responded ${res.status}`);
      throw new Error(`AI service error ${res.status}: ${text.slice(0, 200)}`);
    }
    const parsed = (await res.json()) as T;
    noteAiServiceSuccess();
    return parsed;
  } catch (err) {
    if (isColdStartError(err)) noteAiServiceFailure('generate request failed (network/timeout)');
    throw err;
  }
}
