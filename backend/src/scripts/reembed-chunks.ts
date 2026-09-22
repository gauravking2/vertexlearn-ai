import 'dotenv/config';
import { getEmbeddingDim, getEmbeddingProvider, serializeEmbedding, validateEmbeddingDim } from '../ai/embeddings';
import { needsEmbedding } from '../ai/embeddingHealth';
import { db } from '../db/pool';
import { logger } from '../logger';

/**
 * Repair chunk embeddings (idempotent, additive-only).
 *
 * Why this exists: the demo seed used to insert `document_chunks` rows with
 * `embedding = NULL`. Retrieval still returned those rows, but the pgvector
 * distance scored 0.0 for every one of them, so a freshly seeded deployment
 * answered "I could not find this in the course material." to every question
 * while the lecture titles and sources looked correct. Chunks can also end up
 * unembedded when an ingest ran without an embedding credential.
 *
 * Usage:
 *   npm run ai:reembed            # local (tsx)
 *   npm run ai:reembed:prod       # deployed image (node dist)
 *   DRY_RUN=1 npm run ai:reembed  # report only
 *
 * Safe to re-run: only rows with a missing/invalid embedding are touched, and
 * each row is updated in place (no deletes, no schema changes).
 */

interface ChunkRow {
  id: string;
  chunk_text: string;
  embedding: string | null;
}

async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN === '1';
  const dim = getEmbeddingDim();
  const provider = getEmbeddingProvider();
  logger.info({ dryRun, provider: provider.name, dim }, 'reembed: scanning document_chunks');

  const rows = await db.query(
    `SELECT id, chunk_text, embedding::text AS embedding FROM document_chunks ORDER BY course_id, chunk_index`,
  );
  const all = rows.rows as unknown as ChunkRow[];
  const broken = all.filter((r) => needsEmbedding(r.embedding, dim));
  logger.info({ scanned: all.length, missing: broken.length }, 'reembed: scan complete');

  if (!broken.length) {
    logger.info('reembed: nothing to repair — every chunk already has a usable embedding');
    return;
  }
  if (dryRun) {
    logger.info({ missing: broken.length }, 'reembed: DRY_RUN — no rows written');
    return;
  }

  let repaired = 0;
  let failed = 0;
  for (const row of broken) {
    try {
      const [vector] = await provider.embed([row.chunk_text]);
      validateEmbeddingDim(vector, dim);
      await db.query(`UPDATE document_chunks SET embedding = $1 WHERE id = $2`, [serializeEmbedding(vector), row.id]);
      repaired += 1;
    } catch (err) {
      failed += 1;
      logger.error(
        { err: err instanceof Error ? err.message : String(err), chunkId: row.id },
        'reembed: chunk failed (row left untouched)',
      );
    }
  }
  logger.info({ repaired, failed, total: broken.length }, 'reembed: done');
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'reembed: fatal');
  process.exitCode = 1;
});
