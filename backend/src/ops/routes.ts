import { Router } from 'express';
import { db } from '../db/pool';
import { getRedis } from '../cache/redis';

export const opsRouter = Router();

const SERVICE = 'vertexlearn-backend';
const VERSION = process.env.npm_package_version ?? '0.1.0';

opsRouter.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE, version: VERSION });
});

// Alias required by Phase 7 observability (health + readiness pair).
opsRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE, version: VERSION });
});

opsRouter.get('/readyz', async (_req, res) => {
  const checks: Record<string, string> = {};
  try {
    await db.query('SELECT 1 AS ok');
    checks.db = 'ok';
  } catch {
    checks.db = 'error';
  }
  const redis = getRedis();
  if (redis) {
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }
  } else {
    checks.redis = 'skipped';
  }
  const ready = checks.db === 'ok' && (checks.redis === 'ok' || checks.redis === 'skipped');
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', service: SERVICE, version: VERSION, checks });
});

// Alias for the readiness probe.
opsRouter.get('/ready', async (req, res) => {
  res.redirect(307, '/readyz');
  void req;
});
