import { needsEmbedding } from '../src/ai/embeddingHealth';

/**
 * A seeded course used to ship `document_chunks.embedding = NULL`: retrieval
 * returned the rows (so sources appeared) but every score was 0.0, and the
 * Tutor refused every question. These pin the detection used by
 * `npm run ai:reembed` to find exactly those rows.
 */
describe('chunk embedding health', () => {
  const dim = 3;

  test('missing or empty vectors need embedding', () => {
    expect(needsEmbedding(null, dim)).toBe(true);
    expect(needsEmbedding(undefined, dim)).toBe(true);
    expect(needsEmbedding('', dim)).toBe(true);
    expect(needsEmbedding('   ', dim)).toBe(true);
    expect(needsEmbedding('[]', dim)).toBe(true);
  });

  test('pgvector text form is accepted when complete', () => {
    expect(needsEmbedding('[0.1,0.2,0.3]', dim)).toBe(false);
    expect(needsEmbedding('[0.1,0.2]', dim)).toBe(true);
    expect(needsEmbedding('[0.1,0.2,0.3,0.4]', dim)).toBe(true);
  });

  test('json array form is accepted when complete', () => {
    expect(needsEmbedding(JSON.stringify([0.1, 0.2, 0.3]), dim)).toBe(false);
    expect(needsEmbedding(JSON.stringify([1, 2]), dim)).toBe(true);
  });

  test('non-finite values and junk need embedding', () => {
    expect(needsEmbedding('[0.1,null,0.3]', dim)).toBe(true);
    expect(needsEmbedding('[0.1,abc,0.3]', dim)).toBe(true);
    expect(needsEmbedding('not-a-vector', dim)).toBe(true);
    expect(needsEmbedding('{}', dim)).toBe(true);
  });
});
