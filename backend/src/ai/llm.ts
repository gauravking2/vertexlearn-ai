import { logger } from '../logger';

export type ExplanationMode = 'beginner' | 'intermediate' | 'advanced';

export interface ChatCompletionInput {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface LlmProvider {
  name: string;
  chat(input: ChatCompletionInput): Promise<string>;
}

let overrideLlm: LlmProvider | undefined;

export function setLlmProviderForTests(provider: LlmProvider | undefined): void {
  overrideLlm = provider;
}

export function getLlmProviderName(): string {
  // AI_TUTOR_PROVIDER is the AI-tutor-specific override (e.g. mistral); the
  // generic LLM_PROVIDER remains the fallback for every other LLM surface.
  return (process.env.AI_TUTOR_PROVIDER ?? process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();
}

/** OpenRouter chat model. Runtime variable is AI_TUTOR_MODEL; openrouter/free is a real OpenRouter auto-router slug that resolves to currently-available free models. Blank counts as unset. */
export function getOpenRouterChatModel(): string {
  return process.env.AI_TUTOR_MODEL?.trim() || 'openrouter/free';
}

/** OpenRouter base URL (OpenAI-compatible). Blank counts as unset. */
export function getOpenRouterBaseUrl(): string {
  return process.env.AI_TUTOR_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';
}

/** Server-side Mistral key for AI Tutor chat. STRICT: never sent to the frontend. */
export function getMistralApiKey(): string {
  return process.env.AI_TUTOR_API_KEY?.trim() || '';
}

/** Mistral chat model. Blank counts as unset — never inherit a non-Mistral model name. */
export function getMistralChatModel(): string {
  return process.env.AI_TUTOR_CHAT_MODEL?.trim() || 'magistral-small-2506';
}

/** Server-side Gemini key. STRICT: never falls back to the Anthropic key. */
export function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() || '';
}

export function getGeminiChatModel(): string {
  // Default is the Google-recommended Flash model: gemini-2.5-flash is
  // retired for new API users (provider 404 names gemini-3.6-flash as the
  // replacement). Explicit LLM_CHAT_MODEL always wins.
  return process.env.LLM_CHAT_MODEL?.trim() || 'gemini-3.6-flash';
}

export function getLlmChatModel(): string {
  // Blank counts as unset (live-verification regression fix: an empty
  // LLM_CHAT_MODEL must not be sent to the provider).
  return process.env.LLM_CHAT_MODEL?.trim() || 'claude-3-5-sonnet-latest';
}

class MockLlmProvider implements LlmProvider {
  name = 'mock';
  async chat(input: ChatCompletionInput): Promise<string> {
    const firstLine = input.user.split('\n')[0]?.slice(0, 160) ?? '';
    return `Mock answer (${getLlmChatModel()}): ${firstLine}`;
  }
}

class AnthropicHttpProvider implements LlmProvider {
  name = 'anthropic';
  async chat(input: ChatCompletionInput): Promise<string> {
    const apiKey = process.env.LLM_API_KEY ?? '';
    if (!apiKey) {
      logger.warn('LLM_API_KEY unset — using mock LLM output (tests/dev only)');
      return new MockLlmProvider().chat(input);
    }
    // Blank base URL counts as unset (live-verification regression fix:
    // `LLM_BASE_URL=` produced the relative URL `/v1/messages`).
    const baseUrl = (process.env.LLM_BASE_URL?.trim() || 'https://api.anthropic.com').replace(/\/$/, '');
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 30000);
    const maxRetries = Math.min(Math.max(Number(process.env.LLM_MAX_RETRIES ?? 1), 0), 5);
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const started = Date.now();
        const res = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: getLlmChatModel(),
            max_tokens: input.maxTokens ?? 1024,
            system: input.system,
            messages: [{ role: 'user', content: input.user }],
          }),
          signal: controller.signal,
        });
        const latencyMs = Date.now() - started;
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          // Retry only on transient 429/5xx; fail fast on 4xx (auth/model).
          if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
            logger.warn({ status: res.status, latencyMs, attempt }, 'LLM provider transient error, retrying');
            lastError = new Error(`LLM provider error: ${res.status}`);
            continue;
          }
          throw new Error(`LLM provider error: ${res.status} ${text.slice(0, 200)}`);
        }
        const body = (await res.json()) as { content?: { type: string; text?: string }[] };
        const text = (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n').trim();
        logger.info({ provider: 'anthropic', model: getLlmChatModel(), latencyMs }, 'llm chat completed');
        return text || 'The provider returned an empty response.';
      } catch (err) {
        // AbortError = timeout; retry once when attempts remain.
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if ((isAbort || (err instanceof Error && /fetch failed|network/i.test(err.message))) && attempt < maxRetries) {
          logger.warn({ attempt, timeout: isAbort }, 'LLM request failed transiently, retrying');
          lastError = err;
          continue;
        }
        if (lastError && attempt > 0 && !(err instanceof Error && /LLM provider error: 4/.test(err.message))) {
          // fall through to throw current error
        }
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('LLM provider failed');
  }
}

/**
 * AI Tutor chat provider (Mistral). Same LlmProvider interface and the same
 * timeout/retry/logging discipline as the other HTTP providers. Key is
 * server-side only (AI_TUTOR_API_KEY); never logged, never sent to the
 * frontend. Used ONLY for tutor chat generation — embeddings stay Gemini.
 */
class MistralHttpProvider implements LlmProvider {
  name = 'mistral';
  async chat(input: ChatCompletionInput): Promise<string> {
    const apiKey = getMistralApiKey();
    if (!apiKey) {
      logger.warn('AI_TUTOR_API_KEY unset — using mock LLM output (tests/dev only)');
      return new MockLlmProvider().chat(input);
    }
    const model = getMistralChatModel();
    // Blank LLM_BASE_URL must NOT leak into the Mistral path (it is an
    // Anthropic-oriented variable); Mistral's API base is fixed.
    const baseUrl = (process.env.AI_TUTOR_BASE_URL?.trim() || 'https://api.mistral.ai').replace(/\/$/, '');
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 30000);
    const maxRetries = Math.min(Math.max(Number(process.env.LLM_MAX_RETRIES ?? 1), 0), 5);
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const started = Date.now();
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
            accept: 'application/json',
          },
          body: JSON.stringify({
            model,
            max_tokens: input.maxTokens ?? 1024,
            messages: [
              { role: 'system', content: input.system },
              { role: 'user', content: input.user },
            ],
          }),
          signal: controller.signal,
        });
        const latencyMs = Date.now() - started;
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          // Retry only transient 429/5xx; fail fast on 4xx (auth/model).
          if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
            logger.warn({ status: res.status, latencyMs, attempt }, 'LLM provider transient error, retrying');
            lastError = new Error(`LLM provider error: ${res.status}`);
            continue;
          }
          throw new Error(`LLM provider error: ${res.status} ${text.slice(0, 200)}`);
        }
        const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = (body.choices ?? []).map((c) => c.message?.content ?? '').join('\n').trim();
        logger.info({ provider: 'mistral', model, latencyMs }, 'llm chat completed');
        return text || 'The provider returned an empty response.';
      } catch (err) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if ((isAbort || (err instanceof Error && /fetch failed|network/i.test(err.message))) && attempt < maxRetries) {
          logger.warn({ attempt, timeout: isAbort }, 'LLM request failed transiently, retrying');
          lastError = err;
          continue;
        }
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('LLM provider failed');
  }
}

/**
 * AI Tutor chat provider (OpenRouter, OpenAI-compatible). Same LlmProvider
 * interface and the same timeout/retry/logging discipline as the other HTTP
 * providers. Key is server-side only (AI_TUTOR_API_KEY); never logged, never
 * sent to the frontend. Used ONLY for tutor chat generation — embeddings stay
 * Gemini. Parsing is OpenAI-shaped: choices[0].message.content.
 */
class OpenRouterHttpProvider implements LlmProvider {
  name = 'openrouter';
  async chat(input: ChatCompletionInput): Promise<string> {
    const apiKey = getMistralApiKey(); // same server-side AI_TUTOR_API_KEY credential
    if (!apiKey) {
      logger.warn('AI_TUTOR_API_KEY unset — using mock LLM output (tests/dev only)');
      return new MockLlmProvider().chat(input);
    }
    const model = getOpenRouterChatModel();
    const baseUrl = getOpenRouterBaseUrl().replace(/\/$/, '');
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 30000);
    const maxRetries = Math.min(Math.max(Number(process.env.LLM_MAX_RETRIES ?? 1), 0), 5);
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const started = Date.now();
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
            accept: 'application/json',
          },
          body: JSON.stringify({
            model,
            max_tokens: input.maxTokens ?? 1024,
            messages: [
              { role: 'system', content: input.system },
              { role: 'user', content: input.user },
            ],
          }),
          signal: controller.signal,
        });
        const latencyMs = Date.now() - started;
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          // Retry only transient 429/5xx; fail fast on 4xx (auth/model).
          if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
            logger.warn({ status: res.status, latencyMs, attempt }, 'LLM provider transient error, retrying');
            lastError = new Error(`LLM provider error: ${res.status}`);
            continue;
          }
          throw new Error(`LLM provider error: ${res.status} ${text.slice(0, 200)}`);
        }
        const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = (body.choices ?? []).map((c) => c.message?.content ?? '').join('\n').trim();
        logger.info({ provider: 'openrouter', model, latencyMs }, 'llm chat completed');
        return text || 'The provider returned an empty response.';
      } catch (err) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if ((isAbort || (err instanceof Error && /fetch failed|network/i.test(err.message))) && attempt < maxRetries) {
          logger.warn({ attempt, timeout: isAbort }, 'LLM request failed transiently, retrying');
          lastError = err;
          continue;
        }
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('LLM provider failed');
  }
}

export function getLlmProvider(): LlmProvider {
  if (overrideLlm) return overrideLlm;
  const name = getLlmProviderName();
  if (name === 'mock') return new MockLlmProvider();
  if (name === 'gemini') return new GeminiHttpProvider();
  if (name === 'openrouter') return new OpenRouterHttpProvider();
  if (name === 'mistral') return new MistralHttpProvider();
  return new AnthropicHttpProvider();
}

/**
 * Free-tier runtime provider (Google Gemini). Same LlmProvider interface,
 * same timeout/retry/logging discipline as the Anthropic path. Key is
 * server-side only (GEMINI_API_KEY); never the Anthropic key.
 */
class GeminiHttpProvider implements LlmProvider {
  name = 'gemini';
  async chat(input: ChatCompletionInput): Promise<string> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      logger.warn('GEMINI_API_KEY unset — using mock LLM output (tests/dev only)');
      return new MockLlmProvider().chat(input);
    }
    const model = getGeminiChatModel();
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 30000);
    const maxRetries = Math.min(Math.max(Number(process.env.LLM_MAX_RETRIES ?? 1), 0), 5);
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const started = Date.now();
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: input.system }] },
              contents: [{ role: 'user', parts: [{ text: input.user }] }],
              generationConfig: { maxOutputTokens: input.maxTokens ?? 1024 },
            }),
            signal: controller.signal,
          },
        );
        const latencyMs = Date.now() - started;
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
            logger.warn({ status: res.status, latencyMs, attempt }, 'LLM provider transient error, retrying');
            lastError = new Error(`LLM provider error: ${res.status}`);
            continue;
          }
          throw new Error(`LLM provider error: ${res.status} ${text.slice(0, 200)}`);
        }
        const body = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = (body.candidates ?? [])
          .flatMap((c) => c.content?.parts ?? [])
          .map((p) => p.text ?? '')
          .join('\n')
          .trim();
        logger.info({ provider: 'gemini', model, latencyMs }, 'llm chat completed');
        return text || 'The provider returned an empty response.';
      } catch (err) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if ((isAbort || (err instanceof Error && /fetch failed|network/i.test(err.message))) && attempt < maxRetries) {
          logger.warn({ attempt, timeout: isAbort }, 'LLM request failed transiently, retrying');
          lastError = err;
          continue;
        }
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('LLM provider failed');
  }
}

export interface AiServiceChatClient {
  chat(input: ChatCompletionInput & { mode?: ExplanationMode }): Promise<{ answer: string; grounded: boolean }>;
}

export function createAiServiceChatClient(baseUrl: string, token: string): AiServiceChatClient {
  return {
    async chat(input) {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/internal/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { 'x-ai-service-token': token } : {}) },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`AI service chat failed: ${res.status}`);
      return (await res.json()) as { answer: string; grounded: boolean };
    },
  };
}

export function buildGroundedSystemPrompt(mode: ExplanationMode): string {
  const depth =
    mode === 'beginner'
      ? 'Explain simply with short sentences, define jargon, and give one concrete example.'
      : mode === 'advanced'
        ? 'Assume strong background. Be precise, dense, and point out edge cases.'
        : 'Assume basic familiarity. Balance intuition with key technical detail.';
  return [
    'You are the VertexLearn course tutor.',
    'Answer ONLY from the retrieved course material provided in <context>.',
    'If the context does not support the answer, say so explicitly: state what is missing and suggest which lecture to check.',
    'Never invent facts, citations, timestamps, or sources. Cite sources as [S1], [S2] matching the provided source list.',
    `Explanation mode (${mode}): ${depth}`,
  ].join('\n');
}

export function buildGroundedUserPrompt(question: string, sources: { ref: string; lectureTitle: string; text: string }[]): string {
  const context =
    sources.length === 0
      ? '(no relevant course material retrieved)'
      : sources.map((s) => `[${s.ref}] (${s.lectureTitle}) ${s.text}`).join('\n\n');
  return `Question: ${question}\n\n<context>\n${context}\n</context>\n\nAnswer with citations like [S1]. If unsupported, say: "I could not find this in the course material."`;
}

export function stripForeignCitations(answer: string, allowedRefs: Set<string>): string {
  return answer.replace(/\[S(\d+)\]/g, (m) => (allowedRefs.has(m) ? m : '[S?]'));
}
