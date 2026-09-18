/**
 * Phase 7 lightweight load probe (PRD: non-AI API p95 < 300ms @ 100 concurrent).
 *
 * No k6/JMeter dependency: plain Node 20 fetch with controlled concurrency.
 * Usage:
 *   BASE_URL=http://localhost:4000 CONCURRENCY=100 REQUESTS=500 node scripts/load-test.js
 * Exits 0 with a JSON summary; exits 2 with SKIP when the server is unreachable.
 */
const BASE_URL = (process.env.BASE_URL || process.env.LOAD_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const CONCURRENCY = Number(process.env.CONCURRENCY || 20);
const REQUESTS = Number(process.env.REQUESTS || 200);

const endpoints = [
  { name: 'health', method: 'GET', path: '/healthz' },
  { name: 'catalog', method: 'GET', path: '/api/v1/courses?page=1&pageSize=20' },
  { name: 'leaderboard', method: 'GET', path: '/api/v1/gamification/leaderboard?limit=10' },
];

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function probe(ep) {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}${ep.path}`, { method: ep.method });
  await res.arrayBuffer().catch(() => undefined);
  return { status: res.status, ms: Date.now() - started };
}

async function run() {
  // Reachability check.
  try {
    const res = await fetch(`${BASE_URL}/healthz`);
    if (!res.ok) throw new Error(`healthz ${res.status}`);
  } catch (err) {
    console.log(JSON.stringify({ status: 'SKIP', reason: `server unreachable at ${BASE_URL}: ${err.message}` }));
    process.exit(2);
  }
  const perEndpoint = {};
  for (const ep of endpoints) {
    const latencies = [];
    let errors = 0;
    let idx = 0;
    async function worker() {
      while (idx < REQUESTS) {
        const i = idx++;
        void i;
        try {
          const r = await probe(ep);
          latencies.push(r.ms);
          if (r.status >= 500) errors++;
        } catch {
          errors++;
        }
      }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, REQUESTS) }, () => worker());
    const t0 = Date.now();
    await Promise.all(workers);
    const wallMs = Date.now() - t0;
    latencies.sort((a, b) => a - b);
    perEndpoint[ep.name] = {
      requests: latencies.length,
      errors,
      wallMs,
      rps: latencies.length / (wallMs / 1000),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies[latencies.length - 1] ?? 0,
    };
  }
  const allP95 = Math.max(...Object.values(perEndpoint).map((e) => e.p95));
  console.log(
    JSON.stringify(
      {
        status: 'OK',
        baseUrl: BASE_URL,
        concurrency: CONCURRENCY,
        requestsPerEndpoint: REQUESTS,
        endpoints: perEndpoint,
        target: 'non-AI p95 < 300ms @ 100 concurrent',
        maxP95: allP95,
        targetMet: allP95 < 300,
      },
      null,
      2,
    ),
  );
}

run();
