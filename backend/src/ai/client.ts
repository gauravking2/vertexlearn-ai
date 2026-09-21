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

export async function pingAiService(timeoutMs = 15000): Promise<boolean> {
  const base = aiServiceBaseUrl();
  if (!base) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(timeoutMs, 1000), 30000));
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, {
      method: 'GET',
      headers: { ...(aiServiceToken() ? { 'x-ai-service-token': aiServiceToken() } : {}) },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
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
  try {
    return await callAiServiceChatInner(input);
  } catch (err) {
    // ONE bounded recovery attempt: the first call often wakes a sleeping
    // free-tier service; a short ping lets it boot, then exactly one retry.
    if (!isColdStartError(err)) throw err;
    const warm = await pingAiService(20000);
    void warm;
    return await callAiServiceChatInner(input);
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
    aiServiceTimeoutMs(),
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
  return (await res.json()) as AiServiceChatResponse;
}

export async function callAiServiceGenerate<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = aiServiceBaseUrl();
  if (!base) throw new Error('AI service is not configured');
  const res = await withTimeout(
    fetch(`${base.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(aiServiceToken() ? { 'x-ai-service-token': aiServiceToken() } : {}) },
      body: JSON.stringify(body),
    }),
    aiServiceTimeoutMs(),
    'AI service request',
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI service error ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}
