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
    pool = new PgPool({ connectionString: databaseUrl });
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

