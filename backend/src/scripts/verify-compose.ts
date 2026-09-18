/**
 * Phase 6 compose structure check (honest substitute for
 * `docker compose config`, which needs the Docker engine).
 *
 * Usage: npm run verify:compose
 *
 * Parses infra/docker-compose.yml and asserts the PRD local stack:
 * postgres+pgvector, redis 7, minio (+ bucket init), backend, ai-service,
 * frontend — with healthchecks, dependencies, and secret hygiene (the
 * frontend must never receive storage credentials or JWT secrets).
 * This validates structure only; container runtime still needs Docker.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

interface ComposeService {
  image?: string;
  build?: { context?: string; dockerfile?: string; args?: Record<string, string> } | string;
  environment?: Record<string, string> | string[];
  env_file?: string[];
  ports?: string[];
  volumes?: string[];
  command?: unknown;
  entrypoint?: unknown;
  depends_on?: Record<string, { condition?: string } | string> | string[];
  healthcheck?: { test?: unknown };
}

let failures = 0;

function check(name: string, ok: boolean, detail: string): void {
  // eslint-disable-next-line no-console
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
  if (!ok) failures += 1;
}

async function main(): Promise<void> {
  const file = path.join(__dirname, '..', '..', '..', 'infra', 'docker-compose.yml');
  const raw = await fs.readFile(file, 'utf8');
  const doc = parse(raw) as { services?: Record<string, ComposeService>; volumes?: Record<string, unknown> };
  const services = doc.services ?? {};
  const names = Object.keys(services);

  for (const s of ['postgres', 'redis', 'minio', 'minio-init', 'backend', 'ai-service', 'frontend']) {
    check(`compose.service.${s}`, names.includes(s), names.includes(s) ? 'declared' : `MISSING (have: ${names.join(', ')})`);
  }
  check('compose.postgres.pgvector', (services.postgres?.image ?? '').includes('pgvector') && (services.postgres?.image ?? '').includes('pg15'), services.postgres?.image ?? 'no image');
  check('compose.redis.version', (services.redis?.image ?? '').startsWith('redis:7'), services.redis?.image ?? 'no image');
  check('compose.minio.image', (services.minio?.image ?? '').includes('minio/minio'), services.minio?.image ?? 'no image');
  check('compose.minio-init.buckets', JSON.stringify(services['minio-init']?.entrypoint ?? '').includes('mc mb'), 'mc bucket bootstrap present');
  for (const s of ['postgres', 'redis', 'minio', 'backend', 'ai-service']) {
    check(`compose.health.${s}`, Boolean(services[s]?.healthcheck?.test), services[s]?.healthcheck ? 'healthcheck declared' : 'MISSING healthcheck');
  }
  const backendDeps = services.backend?.depends_on as Record<string, { condition?: string }> | undefined;
  for (const [dep, cond] of [['postgres', 'service_healthy'], ['redis', 'service_healthy'], ['minio', 'service_healthy'], ['minio-init', 'service_completed_successfully']] as const) {
    check(`compose.backend.dep.${dep}`, backendDeps?.[dep]?.condition === cond, backendDeps?.[dep]?.condition ?? 'missing');
  }
  const backendEnv = JSON.stringify({ ...(services.backend?.environment ?? {}), file: services.backend?.env_file ?? [] });
  for (const key of ['DATABASE_URL', 'REDIS_URL', 'STORAGE_ENDPOINT', 'STORAGE_PUBLIC_ENDPOINT', 'AI_SERVICE_URL']) {
    check(`compose.backend.env.${key}`, backendEnv.includes(key), backendEnv.includes(key) ? 'wired' : 'MISSING');
  }
  const frontendBlob = JSON.stringify(services.frontend ?? {});
  const leaks = ['STORAGE_SECRET_KEY', 'MINIO_ROOT_PASSWORD', 'JWT_ACCESS_SECRET', 'POSTGRES_PASSWORD', 'REDIS_PASSWORD'].filter((k) => frontendBlob.includes(k));
  check('compose.frontend.no-secrets', leaks.length === 0, leaks.length ? `LEAKED: ${leaks.join(', ')}` : 'no credentials reach the browser image');
  check('compose.ai-service.build', typeof services['ai-service']?.build === 'object', JSON.stringify(services['ai-service']?.build ?? 'missing'));
  check('compose.frontend.build', typeof services.frontend?.build === 'object', JSON.stringify(services.frontend?.build ?? 'missing'));
  const volumes = Object.keys(doc.volumes ?? {});
  for (const v of ['pgdata', 'redisdata', 'miniodata']) {
    check(`compose.volume.${v}`, volumes.includes(v), volumes.includes(v) ? 'declared' : 'MISSING');
  }
  // eslint-disable-next-line no-console
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nCompose structure OK (runtime still requires Docker)');
  if (failures) process.exitCode = 1;
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('verify:compose crashed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
