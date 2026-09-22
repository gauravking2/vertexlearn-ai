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

function buildPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
  // TLS policy per host (Railway/Supabase fix + local plain-TCP fix).
  //
  // Root cause (Railway logs 2026-09-21): pg v9 parses `?sslmode=require`
  // out of the connection string and upgrades to TLS ITSELF, treating
  // `require` as full chain verification — our explicit
  // `ssl: { rejectUnauthorized: false }` never won, so Supabase's chain
  // failed with SELF_SIGNED_CERT_IN_CHAIN and every query 500'd.
  //
  // Fix: strip the sslmode param from the URL pg sees, and decide TLS
  // ourselves by host:
  // - Managed Postgres (Supabase pooler, *.supabase.co, or any URL that
  //   carried an sslmode=require/prefer/verify-*/allow param): TLS ON with
  //   chain verification skipped (traffic stays encrypted), unless
  //   PGSSL_STRICT=1 restores full verification.
  // - Plain-TCP Compose/localhost (loopback or in-stack hostname like
  //   `postgres` with NO sslmode param): pass NO ssl option so pg never
  //   attempts STARTTLS ("server does not support SSL" otherwise).
  const strict = process.env.PGSSL_STRICT === '1';
  const sslParam = /[?&]sslmode=([^&]*)/.exec(databaseUrl.toLowerCase())?.[1] ?? '';
  const tlsParam = sslParam !== '' && sslParam !== 'disable';
  const stripped = databaseUrl.replace(/([?&])sslmode=[^&]*&?/i, '$1').replace(/[?&]$/, '');
  let host = '';
  try {
    host = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    host = '';
  }
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const inStackHost = host === 'postgres' || host === 'redis' || host === 'minio';
  const useTls = strict || tlsParam || (!loopback && !inStackHost);
  return new PgPool({
    connectionString: stripped,
    ...(useTls ? { ssl: { rejectUnauthorized: strict } } : {}),
  });
}

function getPool(): Pool {
  if (pgMemDb) return pgMemDb.getPool() as unknown as Pool;
  if (!pool) pool = buildPool();
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

