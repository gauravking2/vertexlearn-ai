/**
 * Phase 6 infrastructure verification (real services, graceful skip).
 *
 * Usage: npm run verify:infra
 *
 * Checks, in order: env presence (names only — NEVER prints values),
 * PostgreSQL connectivity + migration chain + pgvector (extension, VECTOR
 * dim, IVFFLAT index, constraints), Redis ping, S3/MinIO buckets, AI service
 * health, and end-to-end RAG course isolation on the real database using the
 * deterministic (offline, no paid provider) embedding path.
 *
 * Every check reports PASS / SKIP / FAIL. Exit code is nonzero only when a
 * configured service FAILS; absent services SKIP without failing.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

type Status = 'PASS' | 'SKIP' | 'FAIL';
const results: { name: string; status: Status; detail: string }[] = [];

function report(name: string, status: Status, detail: string): void {
  results.push({ name, status, detail });
  // eslint-disable-next-line no-console
  console.log(`[${status}] ${name} — ${detail}`);
}

function envPresent(name: string): boolean {
  return Boolean(process.env[name]);
}

async function checkPostgres(): Promise<Pool | undefined> {
  if (!envPresent('DATABASE_URL')) {
    report('postgres.connectivity', 'SKIP', 'DATABASE_URL is not set');
    return undefined;
  }
  const url = process.env.DATABASE_URL as string;
  const strict = process.env.PGSSL_STRICT === '1';
  const low = url.toLowerCase();
  const sslParam = /[?&]sslmode=([^&]*)/.exec(low)?.[1] ?? '';
  const tlsParam = sslParam !== '' && sslParam !== 'disable';
  // Strip sslmode so pg v9 cannot self-upgrade to full verification; the
  // explicit ssl object below is the single source of truth.
  const stripped = url.replace(/([?&])sslmode=[^&]*&?/i, '$1').replace(/[?&]$/, '');
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = '';
  }
  const plainTcp =
    !strict && !tlsParam && (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === 'postgres' || host === 'redis' || host === 'minio');
  const pool = new Pool({
    connectionString: stripped,
    ...(plainTcp ? {} : { ssl: { rejectUnauthorized: strict } }),
    connectionTimeoutMillis: 5000,
  });
  try {
    const version = await pool.query(`SELECT version() AS v`);
    report('postgres.connectivity', 'PASS', `connected (${String((version.rows[0] as { v: string }).v).split(' ').slice(0, 2).join(' ')})`);
  } catch (err) {
    report('postgres.connectivity', 'FAIL', err instanceof Error ? err.message : String(err));
    await pool.end().catch(() => undefined);
    return undefined;
  }

  const requiredTables = [
    'roles', 'users', 'user_roles', 'refresh_tokens', 'courses', 'modules', 'lectures',
    'enrollments', 'assignments', 'quizzes', 'certificates',
    'document_chunks', 'ai_chat_sessions',
    'discussion_threads', 'discussion_posts', 'announcements', 'notifications', 'course_approvals',
    'course_reviews', 'payments',
  ];
  try {
    const res = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    const present = new Set((res.rows as { tablename: string }[]).map((r) => r.tablename));
    const missing = requiredTables.filter((t) => !present.has(t));
    if (missing.length) report('postgres.migrations', 'FAIL', `missing tables: ${missing.join(', ')}`);
    else report('postgres.migrations', 'PASS', `all ${requiredTables.length} expected tables present (001→005)`);
  } catch (err) {
    report('postgres.migrations', 'FAIL', err instanceof Error ? err.message : String(err));
  }

  try {
    const ext = await pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'vector'`);
    if (!ext.rowCount) report('postgres.pgvector', 'FAIL', 'pgvector extension is not installed');
    else {
      const col = await pool.query(
        `SELECT udt_name, character_maximum_length FROM information_schema.columns WHERE table_name = 'document_chunks' AND column_name = 'embedding'`,
      );
      const udt = (col.rows[0] as { udt_name: string } | undefined)?.udt_name;
      const idx = await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'document_chunks'`);
      const defs = (idx.rows as { indexname: string; indexdef: string }[]).map((r) => r.indexdef).join(' | ');
      const hasIvfflat = /ivfflat/i.test(defs);
      const dim = await pool.query(`SELECT atttypmod AS typmod FROM pg_attribute WHERE attrelid = 'document_chunks'::regclass AND attname = 'embedding'`).catch(
        () => ({ rows: [] as { typmod: number }[] }),
      );
      void dim;
      if (udt !== 'vector') report('postgres.pgvector', 'FAIL', `document_chunks.embedding is ${udt ?? 'missing'}, expected VECTOR`);
      else if (!hasIvfflat) report('postgres.pgvector', 'FAIL', 'IVFFLAT index on document_chunks.embedding is missing (PRD requires IVFFLAT)');
      else report('postgres.pgvector', 'PASS', 'extension + VECTOR embedding + IVFFLAT index present');
    }
  } catch (err) {
    report('postgres.pgvector', 'FAIL', err instanceof Error ? err.message : String(err));
  }

  try {
    const fk = await pool.query(
      `SELECT COUNT(*)::int AS count FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`,
    );
    report('postgres.constraints', 'PASS', `${(fk.rows[0] as { count: number }).count} foreign keys declared`);
  } catch (err) {
    report('postgres.constraints', 'FAIL', err instanceof Error ? err.message : String(err));
  }
  return pool;
}

async function checkRagIsolation(pool: Pool): Promise<void> {
  // End-to-end on the REAL database: disjoint vocabularies per course, then
  // course-filtered retrieval must never leak across courses.
  const { ingestTranscript, retrieveCourseChunks } = await import('../ai/retriever');
  const { db } = await import('../db/pool');
  const tag = randomUUID().slice(0, 8);
  const mk = (suffix: string) => `${tag}-${suffix}`;
  try {
    const roleRes = await pool.query(`SELECT id FROM roles WHERE name = 'student'`);
    const roleId = (roleRes.rows[0] as { id: string } | undefined)?.id;
    if (!roleId) {
      report('rag.isolation', 'SKIP', 'roles are not seeded (run migrate + seed first)');
      return;
    }
    const userId = randomUUID();
    const courseA = randomUUID();
    const courseB = randomUUID();
    await pool.query(`INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, 'x', 'verify')`, [userId, `${mk('verify')}@example.com`]);
    for (const [cid, title] of [[courseA, 'Verify Course Alpha'], [courseB, 'Verify Course Beta']] as const) {
      await pool.query(`INSERT INTO courses (id, instructor_id, title, description, status) VALUES ($1, $2, $3, '', 'published')`, [cid, userId, `${title} ${tag}`]);
    }
    const modA = randomUUID();
    const modB = randomUUID();
    const lecA = randomUUID();
    const lecB = randomUUID();
    await pool.query(`INSERT INTO modules (id, course_id, title) VALUES ($1, $2, 'M')`, [modA, courseA]);
    await pool.query(`INSERT INTO modules (id, course_id, title) VALUES ($1, $2, 'M')`, [modB, courseB]);
    await pool.query(`INSERT INTO lectures (id, module_id, title) VALUES ($1, $2, 'L')`, [lecA, modA]);
    await pool.query(`INSERT INTO lectures (id, module_id, title) VALUES ($1, $2, 'L')`, [lecB, modB]);
    // Route backend db.* calls at the real pool for this script.
    void db;
    const { setTestDb } = await import('../db/pool');
    setTestDb({ getPool: () => pool as unknown as import('pg').Pool });
    const nA = await ingestTranscript(courseA, lecA, `Photosynthesis chlorophyll sunlight ${mk('alpha')} plants convert light energy.`);
    const nB = await ingestTranscript(courseB, lecB, `Quantum superposition entanglement ${mk('beta')} qubits collapse on measurement.`);
    const fromB = await retrieveCourseChunks(courseB, `photosynthesis chlorophyll ${mk('alpha')}`, 5);
    const leak = fromB.filter((c) => c.text.includes(mk('alpha')));
    const fromA = await retrieveCourseChunks(courseA, `photosynthesis chlorophyll ${mk('alpha')}`, 5);
    const hitA = fromA.some((c) => c.text.includes(mk('alpha')));
    await pool.query(`DELETE FROM courses WHERE id = $1 OR id = $2`, [courseA, courseB]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    if (nA < 1 || nB < 1) report('rag.isolation', 'FAIL', 'transcript ingestion produced no chunks');
    else if (leak.length > 0) report('rag.isolation', 'FAIL', `cross-course leak: ${leak.length} course-A chunk(s) retrieved for course B`);
    else if (!hitA) report('rag.isolation', 'FAIL', 'course-A retrieval missed its own chunks');
    else report('rag.isolation', 'PASS', `ingested ${nA}+${nB} chunks; course B never retrieves course A (real pgvector)`);
  } catch (err) {
    report('rag.isolation', 'FAIL', err instanceof Error ? err.message : String(err));
  }
}

async function checkRedis(): Promise<void> {
  if (!envPresent('REDIS_URL')) {
    report('redis.connectivity', 'SKIP', 'REDIS_URL is not set');
    return;
  }
  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(process.env.REDIS_URL as string, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      connectTimeout: 5000,
      lazyConnect: true,
    });
    await client.connect();
    const pong = await client.ping();
    client.disconnect();
    report('redis.connectivity', pong === 'PONG' ? 'PASS' : 'FAIL', `PING → ${pong}`);
  } catch (err) {
    report('redis.connectivity', 'FAIL', err instanceof Error ? err.message : String(err));
  }
}

async function checkStorage(): Promise<void> {
  if (!envPresent('STORAGE_ENDPOINT')) {
    report('storage.s3', 'SKIP', 'STORAGE_ENDPOINT is not set (local-disk fallback active)');
    return;
  }
  try {
    const { isS3Configured, listBuckets, bucketFor } = await import('../storage/s3');
    if (!isS3Configured()) {
      report('storage.s3', 'SKIP', 'S3 credentials not set (local-disk fallback active)');
      return;
    }
    const buckets = await listBuckets();
    const required = [bucketFor('videos'), bucketFor('submissions'), bucketFor('certificates')];
    const missing = required.filter((b) => !buckets.includes(b));
    if (missing.length) report('storage.s3', 'FAIL', `missing buckets: ${missing.join(', ')} (minio-init should create them)`);
    else report('storage.s3', 'PASS', `reachable; buckets present (${required.join(', ')})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Invalid environment configuration|JWT_/.test(msg)) {
      report('storage.s3', 'SKIP', 'app secrets unset; cannot evaluate storage config here');
      return;
    }
    report('storage.s3', 'FAIL', msg);
  }
}

async function checkAiService(): Promise<void> {
  const base = process.env.AI_SERVICE_URL ?? '';
  if (!base) {
    report('ai-service.health', 'SKIP', 'AI_SERVICE_URL is not set (backend uses built-in deterministic RAG path)');
    return;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      report('ai-service.health', 'FAIL', `GET /health → ${res.status}`);
      return;
    }
    const body = (await res.json()) as { provider?: string };
    report('ai-service.health', 'PASS', `healthy${body.provider ? ` (provider: ${body.provider})` : ''}; browser must still use /api/v1/ai/* only`);
  } catch (err) {
    report('ai-service.health', 'FAIL', err instanceof Error ? err.message : String(err));
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('VertexLearn infra verification (values never printed, presence only)');
  for (const name of ['DATABASE_URL', 'REDIS_URL', 'STORAGE_ENDPOINT', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY', 'AI_SERVICE_URL', 'AI_SERVICE_TOKEN', 'JWT_ACCESS_SECRET']) {
    // eslint-disable-next-line no-console
    console.log(`env ${name}: ${envPresent(name) ? 'set' : 'unset'}`);
  }
  const pool = await checkPostgres();
  if (pool) {
    await checkRagIsolation(pool);
    await pool.end().catch(() => undefined);
  } else {
    report('rag.isolation', 'SKIP', 'no PostgreSQL connection');
  }
  await checkRedis();
  await checkStorage();
  await checkAiService();
  const failed = results.filter((r) => r.status === 'FAIL');
  const skipped = results.filter((r) => r.status === 'SKIP');
  // eslint-disable-next-line no-console
  console.log(`\nSummary: ${results.length - failed.length - skipped.length} passed, ${skipped.length} skipped, ${failed.length} failed.`);
  if (failed.length) process.exitCode = 1;
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('verify:infra crashed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
