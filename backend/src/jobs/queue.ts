import { randomUUID } from 'node:crypto';
import { getRedis } from '../cache/redis';
import { logger } from '../logger';

/**
 * Phase 7 minimal queue foundation (PRD architecture expects Redis queue /
 * background jobs). Intentionally small: Redis list when configured, in-memory
 * FIFO otherwise (tests/dev). No new infrastructure required.
 *
 * Supported job kinds (minimum useful set):
 * - document-ingest   (transcript chunk + embed after upload)
 * - video-transcribe  (hook for future transcription workers)
 * - certificate-generate
 * - notification-dispatch (in-app + email fan-out)
 * - recommendation-recalc
 * - streak-process
 *
 * Guarantees: idempotency keys (dedupe re-enqueue), status logging, failure
 * capture, no secrets in payloads (payloads must be IDs/references only).
 */

export type JobKind =
  | 'document-ingest'
  | 'video-transcribe'
  | 'certificate-generate'
  | 'notification-dispatch'
  | 'recommendation-recalc'
  | 'streak-process';

export interface Job<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  kind: JobKind;
  payload: TPayload;
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  lastError?: string;
}

export interface JobResult {
  enqueued: boolean;
  deduplicated: boolean;
  job: Job;
}

type Handler = (job: Job) => Promise<void>;

const handlers = new Map<JobKind, Handler>();
const memQueue: Job[] = [];
const seenKeys = new Set<string>();
const processedLog: { jobId: string; kind: JobKind; status: 'ok' | 'failed'; at: string }[] = [];

export function registerJobHandler(kind: JobKind, handler: Handler): void {
  handlers.set(kind, handler);
}

export function resetJobsForTests(): void {
  memQueue.length = 0;
  seenKeys.clear();
  processedLog.length = 0;
  handlers.clear();
}

export function getJobLog(): typeof processedLog {
  return processedLog;
}

function queueKey(kind: JobKind): string {
  return `vl:jobs:${kind}`;
}

function dedupeKey(key: string): string {
  return `vl:jobkeys:${key}`;
}

async function alreadySeen(key: string): Promise<boolean> {
  if (seenKeys.has(key)) return true;
  const redis = getRedis();
  if (redis) {
    try {
      const exists = await redis.exists(dedupeKey(key));
      return exists === 1;
    } catch {
      return false;
    }
  }
  return false;
}

async function markSeen(key: string): Promise<void> {
  seenKeys.add(key);
  const redis = getRedis();
  if (redis) {
    try {
      // Idempotency window: 24h.
      await redis.set(dedupeKey(key), '1', 'EX', 86400);
    } catch {
      /* best-effort */
    }
  }
}

/** Enqueue a job. Payloads must be IDs only — never secrets or PII blobs. */
export async function enqueueJob<TPayload extends Record<string, unknown>>(
  kind: JobKind,
  payload: TPayload,
  opts: { idempotencyKey?: string; maxAttempts?: number } = {},
): Promise<JobResult> {
  for (const v of Object.values(payload)) {
    if (typeof v === 'string' && /BEGIN (RSA )?PRIVATE KEY|api[_-]?key|bearer /i.test(v)) {
      throw new Error('Job payloads must not contain secrets');
    }
  }
  const idempotencyKey = opts.idempotencyKey ?? `${kind}:${JSON.stringify(payload)}`;
  if (await alreadySeen(idempotencyKey)) {
    const existing = memQueue.find((j) => j.idempotencyKey === idempotencyKey);
    const job: Job = existing ?? {
      id: randomUUID(),
      kind,
      payload,
      idempotencyKey,
      attempts: 0,
      maxAttempts: opts.maxAttempts ?? 3,
      createdAt: new Date().toISOString(),
    };
    logger.info({ jobKind: kind, idempotencyKey }, 'job deduplicated');
    return { enqueued: false, deduplicated: true, job };
  }
  const job: Job = {
    id: randomUUID(),
    kind,
    payload,
    idempotencyKey,
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? 3,
    createdAt: new Date().toISOString(),
  };
  await markSeen(idempotencyKey);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.rpush(queueKey(kind), JSON.stringify(job));
      logger.info({ jobId: job.id, jobKind: kind, service: 'vertexlearn-backend' }, 'job enqueued');
      return { enqueued: true, deduplicated: false, job };
    } catch (err) {
      logger.warn({ err, jobKind: kind }, 'redis enqueue failed, using memory queue');
    }
  }
  memQueue.push(job);
  logger.info({ jobId: job.id, jobKind: kind, service: 'vertexlearn-backend' }, 'job enqueued (memory)');
  return { enqueued: true, deduplicated: false, job };
}

/** Process one job of the given kind (used by workers and tests). */
export async function processNextJob(kind: JobKind): Promise<boolean> {
  const redis = getRedis();
  let raw: string | null = null;
  if (redis) {
    try {
      raw = await redis.lpop(queueKey(kind));
    } catch {
      raw = null;
    }
  }
  let job: Job | undefined;
  if (raw) {
    try {
      job = JSON.parse(raw) as Job;
    } catch {
      job = undefined;
    }
  } else {
    const idx = memQueue.findIndex((j) => j.kind === kind);
    if (idx >= 0) job = memQueue.splice(idx, 1)[0];
  }
  if (!job) return false;
  const handler = handlers.get(kind);
  job.attempts += 1;
  if (!handler) {
    logger.info({ jobId: job.id, jobKind: kind }, 'job skipped (no handler registered)');
    processedLog.push({ jobId: job.id, kind, status: 'ok', at: new Date().toISOString() });
    return true;
  }
  try {
    await handler(job);
    logger.info({ jobId: job.id, jobKind: kind, attempts: job.attempts }, 'job completed');
    processedLog.push({ jobId: job.id, kind, status: 'ok', at: new Date().toISOString() });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    job.lastError = message.slice(0, 500);
    logger.error({ jobId: job.id, jobKind: kind, attempts: job.attempts, err }, 'job failed');
    processedLog.push({ jobId: job.id, kind, status: 'failed', at: new Date().toISOString() });
    if (job.attempts < job.maxAttempts) {
      // Requeue for retry (Redis or memory).
      if (redis) {
        try {
          await redis.rpush(queueKey(kind), JSON.stringify(job));
        } catch {
          memQueue.push(job);
        }
      } else {
        memQueue.push(job);
      }
    }
    return true;
  }
}

export function pendingJobCount(kind?: JobKind): number {
  if (!kind) return memQueue.length;
  return memQueue.filter((j) => j.kind === kind).length;
}

// Default handlers: wire the minimum useful background work through the
// existing services (idempotent, best-effort, fully logged).
export function registerDefaultJobHandlers(deps: {
  onNotification?: (payload: Record<string, unknown>) => Promise<void>;
  onRecommendationRecalc?: (payload: Record<string, unknown>) => Promise<void>;
  onStreak?: (payload: Record<string, unknown>) => Promise<void>;
  onCertificate?: (payload: Record<string, unknown>) => Promise<void>;
  onIngest?: (payload: Record<string, unknown>) => Promise<void>;
} = {}): void {
  registerJobHandler('notification-dispatch', async (job) => {
    if (deps.onNotification) await deps.onNotification(job.payload);
  });
  registerJobHandler('recommendation-recalc', async (job) => {
    if (deps.onRecommendationRecalc) await deps.onRecommendationRecalc(job.payload);
  });
  registerJobHandler('streak-process', async (job) => {
    if (deps.onStreak) await deps.onStreak(job.payload);
  });
  registerJobHandler('certificate-generate', async (job) => {
    if (deps.onCertificate) await deps.onCertificate(job.payload);
  });
  registerJobHandler('document-ingest', async (job) => {
    if (deps.onIngest) await deps.onIngest(job.payload);
  });
  registerJobHandler('video-transcribe', async (job) => {
    logger.info({ jobId: job.id, lectureId: (job.payload as { lectureId?: string }).lectureId }, 'video transcription hook (no-op until provider configured)');
  });
}
