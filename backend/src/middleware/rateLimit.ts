import type { NextFunction, Request, Response } from 'express';
import { getRedis } from '../cache/redis';
import { logger } from '../logger';

/**
 * Phase 7 PRD rate limits:
 * - Auth: 10 req/min/IP
 * - AI chat: 20 req/min/user
 * - Other authenticated endpoints: 100 req/min/user
 *
 * Redis-backed fixed-window counters when REDIS_URL is set; in-memory
 * fallback otherwise (tests/dev single-instance). All limiters set
 * standard RateLimit-* headers and return 429 with Retry-After.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const memBuckets = new Map<string, Bucket>();

export function resetRateLimitsForTests(): void {
  memBuckets.clear();
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function userKey(req: Request): string {
  return req.user?.id ?? clientIp(req);
}

async function checkFixedWindow(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; resetAfterMs: number }> {
  const redis = getRedis();
  if (redis) {
    try {
      const now = Date.now();
      const windowId = Math.floor(now / windowMs);
      const redisKey = `vl:rl:${key}:${windowId}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.pexpire(redisKey, windowMs);
      const ttl = await redis.pttl(redisKey);
      return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAfterMs: ttl > 0 ? ttl : windowMs };
    } catch (err) {
      logger.warn({ err }, 'rate-limit redis failed, using memory fallback');
    }
  }
  const now = Date.now();
  const entry = memBuckets.get(key);
  if (!entry || now >= entry.resetAt) {
    memBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAfterMs: windowMs };
  }
  entry.count += 1;
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAfterMs: entry.resetAt - now };
}

function limiter(opts: { limit: number; windowMs: number; keyPrefix: string; keyOf: (req: Request) => string }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Tests run with a very high global limit; per-route limits must still be
    // verifiable, so they stay active unless explicitly disabled. To avoid
    // breaking the existing 137-test suite (which issues bursts), scoped
    // limiters are bypassed in test env unless RATE_LIMIT_ENFORCE=1 (set by
    // the rate-limit test suite).
    if (process.env.DISABLE_RATE_LIMITS === '1') {
      next();
      return;
    }
    const inTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    if (inTest && process.env.RATE_LIMIT_ENFORCE !== '1') {
      next();
      return;
    }
    const key = `${opts.keyPrefix}:${opts.keyOf(req)}`;
    const result = await checkFixedWindow(key, opts.limit, opts.windowMs);
    res.setHeader('RateLimit-Limit', String(opts.limit));
    res.setHeader('RateLimit-Remaining', String(result.remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(result.resetAfterMs / 1000)));
    if (!result.allowed) {
      res.setHeader('Retry-After', String(Math.ceil(result.resetAfterMs / 1000)));
      res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many requests, please slow down' });
      return;
    }
    next();
  };
}

/** 10 req/min/IP for login/register/refresh. */
export const authRateLimit = (windowMs = 60_000, limit = 10): ((req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  limiter({ limit, windowMs, keyPrefix: 'auth', keyOf: clientIp });

/** 20 req/min/user for AI chat/messages + generation endpoints. */
export const aiRateLimit = (windowMs = 60_000, limit = 20): ((req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  limiter({ limit, windowMs, keyPrefix: 'ai', keyOf: userKey });

/** 100 req/min/user for other authenticated endpoints. */
export const authenticatedRateLimit = (windowMs = 60_000, limit = 100): ((req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  limiter({ limit, windowMs, keyPrefix: 'authed', keyOf: userKey });
