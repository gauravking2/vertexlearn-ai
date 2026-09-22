import { getEmbeddingDim } from './embeddings';

/**
 * Does this stored embedding need (re)generating?
 *
 * A NULL, empty, wrong-dimension or unparseable vector makes retrieval score
 * 0.0 for the row, which reads to the user as "the tutor says the course
 * material doesn't cover anything" even though the sources are listed. Handles
 * both pgvector's text form ("[0.1,0.2,...]") and a JSON array.
 */
export function needsEmbedding(raw: string | null | undefined, dim = getEmbeddingDim()): boolean {
  if (raw === null || raw === undefined) return true;
  const text = raw.trim();
  if (!text || text === '[]') return true;

  const fromJson = (value: unknown): boolean | null => {
    if (!Array.isArray(value)) return null;
    if (value.length !== dim) return true;
    return !value.every((v) => typeof v === 'number' && Number.isFinite(v));
  };

  try {
    const parsed = fromJson(JSON.parse(text));
    if (parsed !== null) return parsed;
  } catch {
    /* fall through to pgvector text form */
  }

  const stripped = text.replace(/^\[|\]$/g, '');
  if (!stripped) return true;
  const parts = stripped.split(',').map((p) => Number(p.trim()));
  if (parts.length !== dim) return true;
  return !parts.every((v) => Number.isFinite(v));
}
