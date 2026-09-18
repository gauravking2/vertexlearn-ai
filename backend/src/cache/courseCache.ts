import { getRedis } from './redis';
import { logger } from '../logger';

/**
 * Phase 7 Redis cache foundation (PRD: catalog, course metadata, leaderboard).
 *
 * - Redis-backed when REDIS_URL is configured (ioredis).
 * - In-memory fallback with TTL when Redis is absent (notably unit tests).
 * - Only non-sensitive, non-per-user aggregates are cached here. Never cache
 *   per-user data, JWTs, or secrets through these helpers.
 */

export const CACHE_TTL = {
  /** Course catalog listings (public aggregates). */
  catalog: 60,
  /** Single course metadata/detail (public aggregates). */
  courseMeta: 120,
  /** Leaderboard reads (public aggregates). */
  leaderboard: 60,
} as const;

interface MemEntry {
  value: string;
  expiresAt: number;
}

const mem = new Map<string, MemEntry>();
/** Test hook: last operation outcome for cache hit/miss assertions. */
export let lastCacheOutcome: 'hit' | 'miss' | 'bypass' | null = null;

export function resetCacheForTests(): void {
  mem.clear();
  lastCacheOutcome = null;
}

function memGet(key: string): string | null {
  const entry = mem.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    mem.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key: string, value: string, ttlSeconds: number): void {
  mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function memDel(prefix: string): void {
  for (const key of [...mem.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}:`)) mem.delete(key);
  }
}

export async function cacheGet<T>(key: string): Promise<{ hit: boolean; value: T | null }> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw == null) {
        lastCacheOutcome = 'miss';
        return { hit: false, value: null };
      }
      lastCacheOutcome = 'hit';
      return { hit: true, value: JSON.parse(raw) as T };
    } catch (err) {
      logger.warn({ err, key }, 'cache GET failed, treating as miss');
      lastCacheOutcome = 'miss';
      return { hit: false, value: null };
    }
  }
  const raw = memGet(key);
  if (raw == null) {
    lastCacheOutcome = 'miss';
    return { hit: false, value: null };
  }
  lastCacheOutcome = 'hit';
  try {
    return { hit: true, value: JSON.parse(raw) as T };
  } catch {
    return { hit: false, value: null };
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const raw = JSON.stringify(value);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key, raw, 'EX', ttlSeconds);
      return;
    } catch (err) {
      logger.warn({ err, key }, 'cache SET failed, falling back to memory');
    }
  }
  memSet(key, raw, ttlSeconds);
}

export async function cacheInvalidate(prefix: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      // Small keyspace: SCAN + DEL per prefix. Keys are namespaced (vl:*).
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = next;
        if (keys.length) await redis.del(...keys);
      } while (cursor !== '0');
    } catch (err) {
      logger.warn({ err, prefix }, 'cache invalidation failed (redis)');
    }
  }
  memDel(prefix);
}

export function catalogCacheKey(query: Record<string, unknown>): string {
  const ordered = Object.keys(query)
    .sort()
    .map((k) => `${k}=${String(query[k] ?? '')}`)
    .join('&');
  return `vl:catalog:${ordered || 'all'}`;
}

export function courseMetaCacheKey(courseId: string): string {
  return `vl:course:${courseId}`;
}

export function leaderboardCacheKey(limit: number): string {
  return `vl:leaderboard:${limit}`;
}
