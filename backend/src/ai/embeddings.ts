import { createHash } from 'node:crypto';
import { getConfig } from '../config';
import { logger } from '../logger';

export const EMBEDDING_DIM = 1536;

export interface EmbeddingProvider {
  name: string;
  dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

let overrideProvider: EmbeddingProvider | undefined;

export function setEmbeddingProviderForTests(provider: EmbeddingProvider | undefined): void {
  overrideProvider = provider;
}

export function getEmbeddingDim(): number {
  const raw = Number(process.env.EMBEDDING_DIM ?? getConfigSafe()?.EMBEDDING_DIM ?? EMBEDDING_DIM);
  return Number.isInteger(raw) && raw > 0 ? raw : EMBEDDING_DIM;
}

/** Server-side Gemini key. STRICT: never the Anthropic key. */
export function getGeminiEmbeddingKey(): string {
  return process.env.GEMINI_API_KEY?.trim() || '';
}

export function getGeminiEmbeddingModel(): string {
  return process.env.EMBEDDING_MODEL?.trim() || 'gemini-embedding-001';
}

export function isGeminiEmbeddingModel(model = process.env.EMBEDDING_MODEL?.trim() || ''): boolean {
  return model.toLowerCase().startsWith('gemini');
}

function getConfigSafe(): { EMBEDDING_DIM?: string } | undefined {
  try {
    return getConfig() as unknown as { EMBEDDING_DIM?: string };
  } catch {
    return undefined;
  }
}

export function deterministicEmbedding(text: string, dim = getEmbeddingDim()): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    const h = createHash('sha256').update(token).digest();
    const i1 = h.readUInt16BE(0) % dim;
    const i2 = h.readUInt16BE(2) % dim;
    vec[i1] += 1;
    vec[i2] += 0.5;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  }
  return vec;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

class AnthropicEmbeddingStub implements EmbeddingProvider {
  name = 'anthropic-stub';
  dim = getEmbeddingDim();
  async embed(texts: string[]): Promise<number[][]> {
    logger.warn('Anthropic embeddings not wired over HTTP in core backend; using deterministic fallback (tests/dev only)');
    return texts.map((t) => deterministicEmbedding(t, this.dim));
  }
}

/**
 * Phase 7 real embedding provider (Voyage-compatible HTTP API).
 * - Key only from environment (EMBEDDING_API_KEY, explicit only).
 * - Configurable model via EMBEDDING_MODEL (default voyage-3-lite).
 * - Timeout + one safe retry (embeddings are idempotent/safe to retry).
 * - Dimension validated before returning; mismatches throw (callers must not
 *   insert wrong-dim vectors into pgvector).
 */
class VoyageEmbeddingProvider implements EmbeddingProvider {
  name = 'voyage';
  dim = getEmbeddingDim();
  async embed(texts: string[]): Promise<number[][]> {
    // Live-verification fix: ONLY an explicit embedding credential enables
    // the Voyage HTTP path. An Anthropic LLM key is not valid there — using
    // it as fallback turned graceful deterministic retrieval into a hard
    // Voyage 401. Empty/missing key → deterministic fallback (tests/dev, or
    // LLM-only deployments).
    const apiKey = process.env.EMBEDDING_API_KEY ?? '';
    const model = process.env.EMBEDDING_MODEL || 'voyage-3-lite';
    if (!apiKey) {
      logger.warn('EMBEDDING_API_KEY unset — using deterministic fallback (tests/dev only)');
      return texts.map((t) => deterministicEmbedding(t, this.dim));
    }
    const baseUrl = (process.env.EMBEDDING_BASE_URL?.trim() || 'https://api.voyageai.com').replace(/\/$/, '');
    const timeoutMs = Number(process.env.EMBEDDING_TIMEOUT_MS ?? 30000);
    const expectedDim = this.dim;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(`${baseUrl}/v1/embeddings`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, input: texts }),
            signal: controller.signal,
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Embedding provider error: ${res.status} ${text.slice(0, 200)}`);
          }
          const body = (await res.json()) as { data?: { embedding: number[] }[] };
          const vectors = (body.data ?? []).map((d) => d.embedding);
          if (vectors.length !== texts.length) throw new Error('Embedding provider returned mismatched count');
          for (const v of vectors) validateEmbeddingDim(v, expectedDim);
          return vectors;
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        lastError = err;
        logger.warn({ err: err instanceof Error ? err.message : String(err), attempt }, 'embedding provider attempt failed');
        if (attempt === 0) continue;
        throw err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Embedding provider failed');
  }
}

/**
 * Free-tier runtime embedding provider (Google Gemini, gemini-embedding-001).
 * Same EmbeddingProvider interface as the Voyage path. Requests
 * outputDimensionality = configured dim (1536 — pgvector column unchanged)
 * and validates every vector before returning.
 */
class GeminiEmbeddingProvider implements EmbeddingProvider {
  name = 'gemini';
  dim = getEmbeddingDim();
  async embed(texts: string[]): Promise<number[][]> {
    const apiKey = getGeminiEmbeddingKey();
    const model = getGeminiEmbeddingModel();
    if (!apiKey) {
      logger.warn('GEMINI_API_KEY unset — using deterministic fallback (tests/dev only)');
      return texts.map((t) => deterministicEmbedding(t, this.dim));
    }
    const expectedDim = this.dim;
    const timeoutMs = Number(process.env.EMBEDDING_TIMEOUT_MS ?? 30000);
    const out: number[][] = [];
    for (const text of texts) {
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
              body: JSON.stringify({
                model: `models/${model}`,
                content: { parts: [{ text }] },
                outputDimensionality: expectedDim,
              }),
              signal: controller.signal,
            },
          );
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`Embedding provider error: ${res.status} ${errText.slice(0, 200)}`);
          }
          const body = (await res.json()) as { embedding?: { values?: number[] } };
          const vec = (body.embedding?.values ?? []).map(Number);
          validateEmbeddingDim(vec, expectedDim);
          out.push(vec);
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          logger.warn({ err: err instanceof Error ? err.message : String(err), attempt }, 'embedding provider attempt failed');
          if (attempt === 0) continue;
          throw err instanceof Error ? err : new Error(String(err));
        } finally {
          clearTimeout(timer);
        }
      }
      if (lastError) throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
    return out;
  }
}

/** Validate vector dimension before pgvector insert (PRD: 1536). */
export function validateEmbeddingDim(vec: number[], expectedDim = getEmbeddingDim()): void {  if (!Array.isArray(vec) || vec.length !== expectedDim) {
    throw new Error(`Embedding dimension mismatch: got ${Array.isArray(vec) ? vec.length : 'invalid'}, expected ${expectedDim}`);
  }
  if (!vec.every((v) => Number.isFinite(v))) {
    throw new Error('Embedding contains non-finite values');
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (overrideProvider) return overrideProvider;
  // Explicit routing (free-tier runtime = Gemini):
  // - model names gemini-* → Gemini provider (falls back internally w/o key)
  // - explicit Voyage credential → Voyage provider (compat)
  // - Gemini key present → Gemini provider
  // - otherwise deterministic stub (tests / LLM-only deployments)
  if (isGeminiEmbeddingModel()) return new GeminiEmbeddingProvider();
  const voyageKey = process.env.EMBEDDING_API_KEY ?? '';
  if (voyageKey) return new VoyageEmbeddingProvider();
  if (getGeminiEmbeddingKey()) return new GeminiEmbeddingProvider();
  return new AnthropicEmbeddingStub();
}

export function serializeEmbedding(vec: number[]): string {
  return JSON.stringify(vec.map((v) => Number(v.toFixed(6))));
}

export function parseEmbedding(raw: unknown, dim = getEmbeddingDim()): number[] | null {
  if (Array.isArray(raw) && raw.every((v) => typeof v === 'number')) {
    return (raw as number[]).slice(0, dim);
  }
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const nums = (parsed as unknown[]).map(Number).filter((v) => Number.isFinite(v));
        return nums.slice(0, dim);
      }
    } catch {
      return null;
    }
  }
  return null;
}

export interface AiServiceEmbeddingClient {
  embed(texts: string[]): Promise<number[][]>;
  dim: number;
}

export function createAiServiceEmbeddingClient(baseUrl: string, token: string, dim = getEmbeddingDim()): AiServiceEmbeddingClient {
  return {
    dim,
    async embed(texts: string[]): Promise<number[][]> {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/internal/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { 'x-ai-service-token': token } : {}) },
        body: JSON.stringify({ texts }),
      });
      if (!res.ok) throw new Error(`AI service embed failed: ${res.status}`);
      const body = (await res.json()) as { embeddings: number[][] };
      return body.embeddings;
    },
  };
}
