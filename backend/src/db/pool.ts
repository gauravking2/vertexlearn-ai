import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { Pool as PgPool } from 'pg';

let pool: Pool | undefined;
let pgMemDb: { getPool: () => Pool } | undefined;

export interface Db {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export function setTestDb(db: { getPool: () => Pool }): void {
  pgMemDb = db;
}

export function resetDb(): void {
  pool = undefined;
  pgMemDb = undefined;
}

function getPool(): Pool {
  if (pgMemDb) return pgMemDb.getPool() as unknown as Pool;
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL ?? '';
    if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
    // TLS policy per host (Railway fix + local regression fix):
    // - Managed Postgres (Supabase pooler, *.supabase.co, or any URL carrying
    //   an sslmode=require/prefer/verify-*/allow param): keep TLS on. The
    //   chain may be untrusted (SELF_SIGNED_CERT_IN_CHAIN), so skip chain
    //   verification unless PGSSL_STRICT=1 restores full verification.
    // - Plain-TCP Compose/localhost (loopback or in-stack hostname like
    //   `postgres` with NO sslmode param): pass NO ssl option so pg never
    //   attempts STARTTLS ("server does not support SSL" otherwise).
    const strict = process.env.PGSSL_STRICT === '1';
    const low = databaseUrl.toLowerCase();
    const sslParam = /[?&]sslmode=([^&]*)/.exec(low)?.[1] ?? '';
    const tlsParam = sslParam !== '' && sslParam !== 'disable';
    let host = '';
    try {
      host = new URL(databaseUrl).hostname.toLowerCase();
    } catch {
      host = '';
    }
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const inStackHost = host === 'postgres' || host === 'redis' || host === 'minio';
    const useTls = strict || tlsParam || (!loopback && !inStackHost);
    pool = new PgPool({
      connectionString: databaseUrl,
      ...(useTls ? { ssl: { rejectUnauthorized: strict } } : {}),
    });
  }
  return pool;
}

export const db: Db = {
  query: async (text: string, params?: unknown[]) => {
    const p = getPool();
    try {
      const res = await p.query(text, params as unknown[]);
      return { rows: res.rows as Record<string, unknown>[], rowCount: res.rowCount };
    } catch (err) {
      // Supabase pooler (Supavisor) drops idle pooled connections without
      // notice: the first query on a stale socket fails with ECONNRESET /
      // "Connection terminated unexpectedly". Retry once on a FRESH pool so
      // one dead socket can never 500 an otherwise healthy request.
      const message = err instanceof Error ? err.message : String(err);
      if (/connection terminated unexpectedly|ECONNRESET|ECONNREFUSED|57P01|57P02/i.test(message)) {
        try {
          await (p as unknown as { end: () => Promise<void> }).end().catch(() => undefined);
        } catch {
          /* ignore close errors */
        }
        pool = undefined;
        const fresh = getPool();
        const res = await fresh.query(text, params as unknown[]);
        return { rows: res.rows as Record<string, unknown>[], rowCount: res.rowCount };
      }
      throw err;
    }
  },
};

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export function newId(): string {
  return randomUUID();
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function isPgMem(): boolean {
  return pgMemDb !== undefined;
}

