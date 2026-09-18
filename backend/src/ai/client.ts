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
  const res = await fetch(`${base.replace(/\/$/, '')}/v1/chat/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(aiServiceToken() ? { 'x-ai-service-token': aiServiceToken() } : {}) },
    body: JSON.stringify({ course_id: input.courseId, question: input.question, mode: input.mode, top_k: input.topK ?? 5 }),
  });
  if (!res.ok) throw new Error(`AI service error: ${res.status}`);
  return (await res.json()) as AiServiceChatResponse;
}

export async function callAiServiceGenerate<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const base = aiServiceBaseUrl();
  if (!base) throw new Error('AI service is not configured');
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(aiServiceToken() ? { 'x-ai-service-token': aiServiceToken() } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI service error ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}
