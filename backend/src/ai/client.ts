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
  const raw = Number(process.env.AI_SERVICE_TIMEOUT_MS ?? 90000);
  if (!Number.isFinite(raw) || raw <= 0) return 90000;
  return Math.min(Math.max(Math.floor(raw), 5000), 180000);
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

export async function callAiServiceChat(input: {
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
