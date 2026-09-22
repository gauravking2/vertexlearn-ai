import { db, isPgMem, newId } from '../db/pool';
import { logger } from '../logger';
import { chunkTranscript } from './chunking';
import { cosineSimilarity, getEmbeddingDim, getEmbeddingProvider, parseEmbedding, serializeEmbedding, validateEmbeddingDim } from './embeddings';

export interface RetrievedChunk {
  id: string;
  lectureId: string | null;
  lectureTitle: string;
  chunkIndex: number;
  text: string;
  score: number;
}

export async function ingestTranscript(courseId: string, lectureId: string, transcript: string): Promise<number> {
  const chunks = chunkTranscript(transcript);
  const provider = getEmbeddingProvider();
  const expectedDim = getEmbeddingDim();
  const vectors = await provider.embed(chunks.map((c) => c.text));
  // PRD: must produce the configured dim (1536); validate before inserting.
  for (const v of vectors) validateEmbeddingDim(v, expectedDim);
  await db.query(`DELETE FROM document_chunks WHERE lecture_id = $1`, [lectureId]);
  let n = 0;
  for (let i = 0; i < chunks.length; i++) {
    await db.query(
      `INSERT INTO document_chunks (id, course_id, lecture_id, chunk_index, chunk_text, embedding) VALUES ($1, $2, $3, $4, $5, $6)`,
      [newId(), courseId, lectureId, chunks[i].index, chunks[i].text, serializeEmbedding(vectors[i] ?? [])],
    );
    n++;
  }
  return n;
}

export async function retrieveCourseChunks(courseId: string, query: string, topK = 5): Promise<RetrievedChunk[]> {
  const limit = Math.min(Math.max(topK, 1), 20);
  if (isPgMem()) {
    const rows = await db.query(
      `SELECT dc.id, dc.lecture_id, dc.chunk_index, dc.chunk_text, dc.embedding, l.title AS lecture_title
       FROM document_chunks dc LEFT JOIN lectures l ON l.id = dc.lecture_id WHERE dc.course_id = $1`,
      [courseId],
    );
    const provider = getEmbeddingProvider();
    const [qVec] = await provider.embed([query]);
    const scored = (rows.rows as { id: string; lecture_id: string | null; chunk_index: number; chunk_text: string; embedding: unknown; lecture_title: string | null }[])
      .map((r) => {
        const vec = parseEmbedding(r.embedding) ?? [];
        return {
          id: r.id,
          lectureId: r.lecture_id,
          lectureTitle: r.lecture_title ?? 'Lecture',
          chunkIndex: r.chunk_index,
          text: r.chunk_text,
          score: cosineSimilarity(qVec, vec),
        } satisfies RetrievedChunk;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored;
  }
  const provider = getEmbeddingProvider();
  const [qVec] = await provider.embed([query]);
  const literal = serializeEmbedding(qVec).replace(/'/g, "''");
  const rows = await db.query(
    `SELECT dc.id, dc.lecture_id, dc.chunk_index, dc.chunk_text, l.title AS lecture_title,
            (1 - (dc.embedding <=> '${literal}'::vector)) AS score
     FROM document_chunks dc LEFT JOIN lectures l ON l.id = dc.lecture_id
     WHERE dc.course_id = $1 ORDER BY dc.embedding <=> '${literal}'::vector LIMIT ${limit}`,
    [courseId],
  );
  const scored = (rows.rows as { id: string; lecture_id: string | null; chunk_index: number; chunk_text: string; lecture_title: string | null; score: number }[]).map(
    (r) => ({
      id: r.id,
      lectureId: r.lecture_id,
      lectureTitle: r.lecture_title ?? 'Lecture',
      chunkIndex: r.chunk_index,
      text: r.chunk_text,
      score: Number(r.score ?? 0),
    }),
  );
  // A course with rows but no usable vectors scores exactly 0.0 everywhere
  // (pgvector returns NULL for a NULL embedding). That state makes the Tutor
  // refuse every question while still citing sources, so say so loudly.
  if (scored.length && scored.every((s) => s.score === 0)) {
    logger.warn(
      { courseId, chunks: scored.length },
      'retrieval scored 0.0 for every chunk — document_chunks embeddings are missing; run `npm run ai:reembed`',
    );
  }
  return scored;
}

export function hasRetrievalSupport(texts: RetrievedChunk[], threshold = 0.12): boolean {
  if (!texts.length) return false;
  return texts[0].score >= threshold;
}

export function toCitations(chunks: RetrievedChunk[]): { ref: string; lectureTitle: string; text: string }[] {
  return chunks.map((c, i) => ({ ref: `S${i + 1}`, lectureTitle: c.lectureTitle, text: c.text }));
}

export function assertCourseIsolation(chunks: RetrievedChunk[], courseId: string, rowsCourseId: string[]): void {
  void courseId;
  for (const id of rowsCourseId) {
    if (id !== courseId) throw new Error('Course isolation violated: foreign chunk retrieved');
  }
  void chunks;
}
