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
    // TLS policy per environment (Railway fix + local regression fix):
    // - explicit sslmode=disable (or a host that resolves to this Compose
    //   stack / loopback without any sslmode) means plain TCP: pass NO ssl
    //   option so pg never attempts STARTTLS. Sending any `ssl` object
    //   against a non-TLS server fails with "server does not support SSL".
    // - anywhere else (Supabase pooler, managed Postgres), the chain may be
    //   untrusted (SELF_SIGNED_CERT_IN_CHAIN): keep TLS on but skip chain
    //   verification unless PGSSL_STRICT=1 restores full verification.
    const strict = process.env.PGSSL_STRICT === '1';
    const low = databaseUrl.toLowerCase();
    const explicitDisable = low.includes('sslmode=disable');
    const looksLocal = /localhost|127\.0\.0\.1|postgres|redis|minio/.test(low);
    const useTls = strict || (!explicitDisable && !looksLocal);
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
    const res = await p.query(text, params as unknown[]);
    return { rows: res.rows as Record<string, unknown>[], rowCount: res.rowCount };
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

