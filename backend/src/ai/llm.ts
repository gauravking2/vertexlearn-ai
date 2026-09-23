import { logger } from '../logger';

export type ExplanationMode = 'beginner' | 'intermediate' | 'advanced';

export interface ChatCompletionInput {
  system: string;
  user: string;
  maxTokens?: number;
  // Per-call overrides used by the bounded fallback chain (chatWithFallback).
  // Without them a hanging provider can consume the request budget twice
  // (one attempt + one retry) before the UI hears anything.
  timeoutMs?: number;
  maxRetries?: number;
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

/** Server-side Pollinations key for AI Tutor chat. STRICT: never sent to the frontend. */
export function getPollinationsApiKey(): string {
  return process.env.POLLINATIONS_API_KEY?.trim() || '';
}

/** Pollinations chat model. Blank counts as unset. */
export function getPollinationsChatModel(): string {
  return process.env.POLLINATIONS_CHAT_MODEL?.trim() || 'openai';
}

/** Pollinations base URL (OpenAI-compatible). Blank counts as unset. */
export function getPollinationsBaseUrl(): string {
  return process.env.POLLINATIONS_BASE_URL?.trim() || 'https://text.pollinations.ai/openai';
}

/** Server-side Groq key for AI Tutor chat. STRICT: never sent to the frontend. */
export function getGroqApiKey(): string {
  return process.env.GROQ_API_KEY?.trim() || process.env.AI_TUTOR_API_KEY?.trim() || '';
}

/** Groq chat model. Blank counts as unset. */
export function getGroqChatModel(): string {
  return process.env.GROQ_CHAT_MODEL?.trim() || 'llama-3.3-70b-versatile';
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
    const timeoutMs = input.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS ?? 30000);
    const maxRetries = input.maxRetries ?? Math.min(Math.max(Number(process.env.LLM_MAX_RETRIES ?? 1), 0), 5);
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
    const timeoutMs = input.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS ?? 30000);
    const maxRetries = input.maxRetries ?? Math.min(Math.max(Number(process.env.LLM_MAX_RETRIES ?? 1), 0), 5);
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
    const timeoutMs = input.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS ?? 30000);
    const maxRetries = input.maxRetries ?? Math.min(Math.max(Number(process.env.LLM_MAX_RETRIES ?? 1), 0), 5);
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

/**
 * AI Tutor chat provider (Groq, OpenAI-compatible). Same LlmProvider
 * interface and the same timeout/retry/logging discipline as the other HTTP
 * providers. Key is server-side only (GROQ_API_KEY, falling back to the
 * AI-tutor override AI_TUTOR_API_KEY); never logged, never sent to the
 * frontend. Used ONLY for tutor chat generation — embeddings
 * never touch Groq (deterministic fallback is used when no embedding key).
 * Parsing is OpenAI-shaped: choices[0].message.content.
 */
class GroqHttpProvider implements LlmProvider {
  name = 'groq';
  async chat(input: ChatCompletionInput): Promise<string> {
    const apiKey = getGroqApiKey();
    if (!apiKey) {
      logger.warn('GROQ_API_KEY unset — using mock LLM output (tests/dev only)');
      return new MockLlmProvider().chat(input);
    }
    const model = getGroqChatModel();
    const baseUrl = (process.env.GROQ_BASE_URL?.trim() || 'https://api.groq.com/openai').replace(/\/$/, '');
    const timeoutMs = input.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS ?? 30000);
    const maxRetries = input.maxRetries ?? Math.min(Math.max(Number(process.env.LLM_MAX_RETRIES ?? 1), 0), 5);
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
        logger.info({ provider: 'groq', model, latencyMs }, 'llm chat completed');
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
 * AI Tutor chat provider (Pollinations, OpenAI-compatible). Live-verified
 * working route: the only candidate key that returns genuine answers.
 * Same LlmProvider interface and the same timeout/retry/logging discipline
 * as the other HTTP providers. Key is server-side only
 * (POLLINATIONS_API_KEY); never logged, never sent to the frontend. Used
 * ONLY for tutor chat generation — embeddings never touch Pollinations.
 * Parsing is OpenAI-shaped: choices[0].message.content.
 * Generous 60s timeout: the free tier answers in ~15-25s.
 */
class PollinationsHttpProvider implements LlmProvider {
  name = 'pollinations';
  async chat(input: ChatCompletionInput): Promise<string> {
    const apiKey = getPollinationsApiKey();
    const model = getPollinationsChatModel();
    const baseUrl = getPollinationsBaseUrl().replace(/\/$/, '');
    // Accept both spellings: the ai-service uses POLLINATIONS_TIMEOUT_S
    // (seconds) while this backend reads POLLINATIONS_TIMEOUT_MS. Before this
    // the backend silently ignored a configured _S value.
    const configuredTimeout = Number(process.env.POLLINATIONS_TIMEOUT_MS ?? 0) || Number(process.env.POLLINATIONS_TIMEOUT_S ?? 0) * 1000;
    const timeoutMs = input.timeoutMs ?? (configuredTimeout > 0 ? configuredTimeout : 60000);
    const maxRetries = input.maxRetries ?? Math.min(Math.max(Number(process.env.LLM_MAX_RETRIES ?? 1), 0), 5);
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
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
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
        logger.info({ provider: 'pollinations', model, latencyMs }, 'llm chat completed');
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

function providerForName(name: string): LlmProvider {
  if (name === 'mock') return new MockLlmProvider();
  if (name === 'pollinations') return new PollinationsHttpProvider();
  if (name === 'gemini') return new GeminiHttpProvider();
  if (name === 'groq') return new GroqHttpProvider();
  if (name === 'openrouter') return new OpenRouterHttpProvider();
  if (name === 'mistral') return new MistralHttpProvider();
  return new AnthropicHttpProvider();
}

export function getLlmProvider(): LlmProvider {
  if (overrideLlm) return overrideLlm;
  return providerForName(getLlmProviderName());
}

/**
 * Providers tried after the configured primary when it fails. Only providers
 * that can actually authenticate are included: an unkeyed provider would
 * silently return mock text, which is worse than an honest failure. The one
 * exception is Pollinations, which answers real questions without a key.
 */
const FALLBACK_PROVIDER_ORDER = ['gemini', 'groq', 'pollinations', 'openrouter', 'mistral', 'anthropic'] as const;

function providerHasCredential(name: string): boolean {
  if (name === 'pollinations') return true; // keyless route is live-verified
  if (name === 'gemini') return Boolean(getGeminiApiKey());
  if (name === 'groq') return Boolean(getGroqApiKey());
  if (name === 'openrouter') return Boolean(process.env.AI_TUTOR_API_KEY?.trim() || '');
  if (name === 'mistral') return Boolean(getMistralApiKey());
  if (name === 'anthropic') return Boolean(process.env.LLM_API_KEY?.trim() || '');
  return false;
}

/**
 * Ordered provider chain used by the AI Tutor answer path: the configured
 * primary first, then every other provider that has a credential. A single
 * hanging or rate-limited provider therefore degrades to the next one instead
 * of burning the whole request budget.
 */
export function getProviderChain(): LlmProvider[] {
  if (overrideLlm) return [overrideLlm];
  const primary = getLlmProviderName();
  if (primary === 'mock') return [new MockLlmProvider()];
  const names = [primary, ...FALLBACK_PROVIDER_ORDER.filter((n) => n !== primary)];
  const chain: LlmProvider[] = [];
  for (const name of names) {
    if (!providerHasCredential(name)) continue;
    chain.push(providerForName(name));
  }
  return chain.length ? chain : [getLlmProvider()];
}

/** Per-provider attempt budget (never more than the remaining answer budget). */
export function llmAttemptTimeoutMs(): number {
  const raw = Number(process.env.LLM_ATTEMPT_TIMEOUT_MS ?? NaN);
  if (!Number.isFinite(raw) || raw <= 0) return 22000;
  return Math.min(Math.max(Math.floor(raw), 2000), 60000);
}

/** Total wall-clock budget for the whole local answer attempt chain. */
export function llmAnswerBudgetMs(): number {
  const raw = Number(process.env.AI_ANSWER_BUDGET_MS ?? NaN);
  if (!Number.isFinite(raw) || raw <= 0) return 48000;
  return Math.min(Math.max(Math.floor(raw), 5000), 120000);
}

function categorizeLlmError(err: unknown): 'timeout' | 'rate_limit' | 'unavailable' {
  const message = err instanceof Error ? err.message : String(err);
  if (/timed out|timeout|abort/i.test(message)) return 'timeout';
  if (/rate.?limit|LLM provider error: 429/i.test(message)) return 'rate_limit';
  return 'unavailable';
}

export interface LlmFallbackResult {
  answer: string;
  provider: string;
  attempts: { provider: string; category: string }[];
}

/**
 * Answer with the first provider in the chain that succeeds, bounded by
 * LLM_ATTEMPT_TIMEOUT_MS per provider and AI_ANSWER_BUDGET_MS overall. Every
 * attempt runs with maxRetries=0 so a hanging provider cannot double-wait.
 * Throws only when the whole chain is exhausted; a real provider status error
 * is preferred over a bare timeout so the API can report RATE_LIMITED /
 * AI_NOT_CONFIGURED instead of a blanket timeout.
 */
export async function chatWithFallback(input: ChatCompletionInput): Promise<LlmFallbackResult> {
  if (overrideLlm) {
    return { answer: await overrideLlm.chat(input), provider: overrideLlm.name, attempts: [] };
  }
  const chain = getProviderChain();
  const deadline = Date.now() + llmAnswerBudgetMs();
  const attemptTimeoutMs = llmAttemptTimeoutMs();
  const attempts: { provider: string; category: string }[] = [];
  const errors: { provider: string; category: string; error: unknown }[] = [];
  for (const provider of chain) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      attempts.push({ provider: provider.name, category: 'budget_exhausted' });
      break;
    }
    try {
      const answer = await provider.chat({
        ...input,
        timeoutMs: Math.min(attemptTimeoutMs, remaining),
        maxRetries: 0,
      });
      if (answer && answer.trim() && !looksLikePlaceholderAnswer(answer)) {
        return { answer, provider: provider.name, attempts };
      }
      if (looksLikePlaceholderAnswer(answer)) {
        // Missing-credential mock text: a configuration failure, not an answer.
        attempts.push({ provider: provider.name, category: 'placeholder' });
        errors.push({
          provider: provider.name,
          category: 'placeholder',
          error: new Error(`LLM provider '${provider.name}' is not configured (missing credential) — placeholder answer refused`),
        });
      } else {
        attempts.push({ provider: provider.name, category: 'empty' });
      }
    } catch (err) {
      const category = categorizeLlmError(err);
      attempts.push({ provider: provider.name, category });
      errors.push({ provider: provider.name, category, error: err });
    }
  }
  const informative = errors.find((e) => e.category !== 'timeout') ?? errors[0];
  const failure = (informative?.error instanceof Error ? informative.error : new Error('All AI providers failed')) as Error & {
    attempts?: unknown;
    provider?: string;
  };
  failure.attempts = attempts;
  failure.provider = informative?.provider;
  throw failure;
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
    const timeoutMs = input.timeoutMs ?? Number(process.env.LLM_TIMEOUT_MS ?? 30000);
    const maxRetries = input.maxRetries ?? Math.min(Math.max(Number(process.env.LLM_MAX_RETRIES ?? 1), 0), 5);
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

/**
 * Placeholder detection for provider output.
 *
 * Every HTTP provider falls back to `MockLlmProvider` text when its credential
 * is missing, and the AI service did the same (`Mock answer: <question>`).
 * Returned to a student that text is indistinguishable from a real grounded
 * answer — it carries no course facts while the UI still renders citations
 * next to it. Placeholder text is a configuration failure, so the Tutor must
 * treat it as a failed attempt and fall through, never store it.
 */
export function looksLikePlaceholderAnswer(answer: unknown): boolean {
  if (typeof answer !== 'string') return false;
  return /^\s*(mock|placeholder|dummy)\b/i.test(answer) || /^\s*\[?mock answer/i.test(answer);
}
