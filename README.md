# VertexLearn AI — LMS-AI Platform (PRD v1.0, Phase 7)

Monorepo foundation: Express REST backend (`/api/v1`) with JWT auth + RBAC,
PostgreSQL 15 + pgvector, Redis 7, Docker Compose for local dev, plus a
React 18 + Vite + Tailwind student/instructor frontend.
Phase 1 (auth, courses/modules/lectures), Phase 2 (learning core), and
Phase 3 (AI tutor/RAG: `document_chunks` VECTOR(1536) + IVFFLAT, grounded
chat with modes, summaries, AI quiz drafts with instructor approval,
flashcards, study plans, mastery, recommendations) are preserved.
Phase 4 adds the end-to-end frontend experience: auth, student dashboard,
catalog/detail/enrollment, course player, assignments, quizzes, certificates,
gamification, course-scoped AI Tutor, study-plan/flashcard/mastery/
recommendations surfaces, and the instructor workspace. Phase 5 adds the
Admin workspace (dashboard, user/role/suspend management, course approval
queue, platform analytics from real data, flagged-post moderation),
per-course discussions with moderation, instructor announcements, in-app
notifications, and an email abstraction (mocked in tests). Phase 6 wires
real infrastructure contracts: MinIO/S3-compatible object storage
(assignment binary uploads, lecture video assets via signed URLs,
certificate artifacts), server-side catalog filters (category/difficulty/
minRating) with real student reviews, a payments model with status-aware
revenue analytics (no gateway), a full local Docker Compose stack
(postgres+pgvector, redis, minio, backend, ai-service, frontend), and
`verify:infra` / `verify:compose` scripts for honest PASS/SKIP/FAIL
verification where services are available.

## Quick start (local dev, no Docker)

```bash
# 1. Backend
cd backend
npm install
cp ../.env.example .env   # edit secrets locally, never commit .env
npm run migrate           # needs DATABASE_URL reachable; skips gracefully if not
npm run seed              # seeds roles + demo users (needs DB)
npm run dev               # http://localhost:4000/healthz

# 2. Tests (no external DB needed — uses pg-mem)
cd backend
npm test
```

```bash
# 3. AI service tests (mocked LLM/embeddings — no provider key, no live calls)
cd ai-service
pip install -r requirements.txt
pytest
```

## Docker (requires Docker Desktop — NOT available on build machine)

```bash
cp .env.example .env   # fill POSTGRES_PASSWORD, REDIS_PASSWORD, MINIO_ROOT_USER/PASSWORD, JWT secrets
docker compose -f infra/docker-compose.yml up --build
# backend  http://localhost:4000/healthz
# ai-service http://localhost:8000/health
# frontend http://localhost:3000
# minio console http://localhost:9001
# postgres localhost:5432, redis localhost:6379
```

> NOTE: with `-f infra/docker-compose.yml`, run compose with
> `--env-file .env` (project dir resolves to `infra/` otherwise and
> interpolation fails):
> `docker compose --env-file .env -f infra/docker-compose.yml ps`.

## Production deployment (Phase 8, single-host Compose topology)

Topology (only available target: single-host Docker Compose; no cloud
accounts assumed): `frontend` (:3000, public `VITE_API_URL` baked at build)
→ `backend` (:4000) → `postgres:5432` (pgvector), `redis:6379`,
`minio:9000` (private buckets), `ai-service:8000` (service token).
Postgres/Redis/MinIO persist in `pgdata/redisdata/miniodata` volumes.

```bash
# 1. Validate + build production images (no containers touched)
docker compose --env-file .env -f infra/docker-compose.yml config --quiet
docker compose --env-file .env -f infra/docker-compose.yml build   # infra-backend/frontend/ai-service

# 2. Deploy app services only (data services keep running; volumes preserved)
docker compose --env-file .env -f infra/docker-compose.yml up -d ai-service
docker compose --env-file .env -f infra/docker-compose.yml up -d backend     # runs idempotent migrate:prod first
docker compose --env-file .env -f infra/docker-compose.yml up -d frontend

# 3. Verify
curl http://localhost:4000/healthz && curl http://localhost:4000/readyz
curl http://localhost:8000/health && curl http://localhost:3000/
```

Required secret categories (names only — values live in `.env`, never
committed): `POSTGRES_PASSWORD` (+`DATABASE_URL`), `REDIS_PASSWORD`
(+`REDIS_URL`), `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, `MINIO_ROOT_USER`/
`MINIO_ROOT_PASSWORD` (+`STORAGE_ACCESS_KEY/SECRET_KEY`), `GEMINI_API_KEY`
(runtime free-tier key; `LLM_PROVIDER`/`LLM_CHAT_MODEL`/`EMBEDDING_MODEL`
select provider + models — legacy Anthropic `LLM_API_KEY` slot kept for
compat but unused at runtime), `AI_SERVICE_TOKEN`, `EMAIL_*`/
`SENDGRID_API_KEY`, demo `DEMO_*` (never seed production). Frontend image carries only public `VITE_API_URL`/
`VITE_APP_NAME`/`VITE_DEFAULT_LOCALE` (verified: zero secret strings in
`dist/` bundle). Migrations are all `IF NOT EXISTS` (verified) — safe to
re-run; never run destructive DB operations. Local `.env` ships dev-only
settings (`NODE_ENV=development`, `LLM_PROVIDER=mock`, `EMAIL_PROVIDER=mock`,
`SEED_DEMO=true`) — override for any real environment.

Phase 8 staging result (single-host = staging gate on the same topology):
fresh-image redeploy, migrations applied cleanly, **71/71 live smoke checks
PASS** (student/instructor/admin/AI/storage/security), 100-concurrency max
p95 **108ms** (target <300ms MET), Playwright 7/7 on Edge, zero secrets in
backend/AI logs (5000/2000 lines scanned) and frontend bundle. Real-provider
grounded-RAG call remains BLOCKED (no `LLM_API_KEY` available); deterministic
grounded path verified live (`grounded=true` + `[S1]`-style sources,
cross-course isolation, unsupported-question limitation).

## Final handoff — Gemini Free Tier runtime (key from local `.env`, never committed)

This deployment does NOT use Anthropic or Voyage for live traffic (the
Anthropic account has $0 balance; no Voyage credential exists). The runtime
provider is Google Gemini Free Tier, integrated into the existing provider
abstraction on both stacks (Anthropic/Voyage code paths kept for compat):

- `LLM_PROVIDER=gemini`, chat model `gemini-3.6-flash` (configured via
  `LLM_CHAT_MODEL`; `gemini-2.5-flash` is retired for new API users — the
  provider 404 names `gemini-3.6-flash` as the replacement), key strictly
  from `GEMINI_API_KEY` (server-side only). Quiz drafts remain template-based
  by architecture (no LLM call; instructor approval still required).
- Embeddings: `gemini-embedding-001` with `outputDimensionality=1536`
  (pgvector column stays `VECTOR(1536)` — no migration). An Anthropic key is
  deliberately NOT reused for embeddings (live Voyage 401 that broke
  retrieval — fixed, with regression tests on both stacks).
- Live verification (free tier, minimal calls): real embeddings indexed and
  `vector_dims()`-proven 1536 in pgvector; grounded chat `grounded=true`
  with valid `[S1]` citations (~600-char genuine answers); cross-course
  isolation holds (zero foreign cites); unsupported questions get explicit
  refusal scope statements; real summaries; quiz draft flow live.
  Dense-embedding note: unrelated queries score ~0.46 (vs ~0.0 for the old
  token-hash), so the numeric gate (0.12, unchanged) passes and the refusal
  comes from the LLM following the grounded prompt — observed working twice
  with slightly different phrasing, zero fabricated facts.
- Robustness fixes from live verification: set-but-empty `LLM_BASE_URL` /
  `LLM_CHAT_MODEL` / provider/model names now fall back to defaults
  (previously produced the relative URL `/v1/messages`).
- Remote CI (GitHub Actions, run on push): backend + AI jobs green;
  two runner-only failures fixed and re-pushed — frontend tests need Node 24
  (jsdom30/undici8 require `worker_threads.markAsUncloneable`, absent on
  Node 20), and compose static validation needs an empty `.env` present for
  `env_file` resolution plus placeholders for interpolation.

## Layout

| Path | Purpose |
|---|---|
| `frontend/` | React 18 + Vite + TS + Tailwind student/instructor UI (Zustand auth, TanStack Query server state, React Router) |
| `backend/` | Express + TS REST API — Phases 1–3 (auth, courses, learning core, AI integration) |
| `ai-service/` | FastAPI (Python 3.11+) — Phase 3 RAG + AI learning features (`main.py`, `app/routers|rag|recommendation|models|core`) |
| `infra/docker-compose.yml` | postgres (pgvector) + redis + minio (+bucket init) + backend + ai-service + frontend |
| `infra/postgres/init/` | `CREATE EXTENSION vector` bootstrap |
| `docs/architecture.md` | Architecture + choices |
| `docs/api-spec.yaml` | OpenAPI 3.0 for implemented `/api/v1` surface |
| `.env.example` | All variable NAMES, no values |

## API base path

All REST endpoints live under `/api/v1`. Operational endpoints:
`GET /healthz` (liveness), `GET /readyz` (DB + Redis checks).

Phase 2 endpoints (see `docs/api-spec.yaml`): enroll
(`POST /courses/:id/enroll`, `GET /enrollments/me`), lecture progress/notes/
bookmarks (`POST /lectures/:id/progress|notes|bookmarks`), assignments
(`POST /assignments`, `PUT /assignments/:id`, `POST /assignments/:id/submit`,
`PUT /submissions/:id/grade`), quizzes (`POST /quizzes`,
`POST /quizzes/:id/attempt`, `POST /attempts/:id/submit`), certificates
(`GET /certificates/me`, `GET /certificates/:id/download`), gamification
(`GET /gamification/me`), instructor analytics
(`GET /courses/:id/analytics`). Admin-only test/support hook:
`PATCH /courses/:id/status` (enrollment requires `published`).

Phase 3 endpoints (see `docs/api-spec.yaml`): AI chat
(`POST /ai/chat/sessions`, `POST /ai/chat/sessions/:id/messages`,
`PUT /ai/chat/sessions/:id/mode`), transcript ingest
(`POST /ai/lectures/:id/transcript`), summaries
(`POST /ai/lectures/:id/summarize`), AI quiz drafts
(`POST /ai/lectures/:id/generate-quiz`, `GET /ai/quiz-drafts`,
`POST /ai/quiz-drafts/:id/approve|reject`), flashcards
(`POST /ai/modules/:id/flashcards`), study plans (`POST /ai/study-plan`),
mastery (`GET /ai/mastery/:courseId`), recommendations
(`GET /recommendations/me`), AI status (`GET /courses/:id/ai-status`).
Course isolation is server-side: retrieval is always filtered by `course_id`.
AI service (direct, service-to-service only): `GET /health`, `POST
/v1/chat/answer`, `POST /v1/summarize`, `POST /v1/quiz-gen`, `POST
/v1/flashcards`, `POST /v1/study-plan`.

Phase 5 endpoints (see `docs/api-spec.yaml`): admin
(`/admin/users`, `/admin/users/:id/role|suspend`, `DELETE
/admin/users/:id`, `/admin/courses/pending`, `/admin/courses/:id/
approve|reject|decision`, `/admin/courses/:id/approvals`,
`/admin/analytics/overview`, `/admin/moderation/flagged-posts`,
`/admin/moderation/posts/:postId`), discussions
(`/courses/:courseId/discussions/threads`,
`/discussions/threads/:threadId[/posts]`, `/discussions/posts/:postId`
edit/delete/flag/moderate), announcements
(`/courses/:courseId/announcements`), notifications
(`/notifications/me|unread-count|read-all`, `/notifications/:id/read`,
`/notifications/email-status|test-email`). Email is provider-configured by
env NAME only (`EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_HOST/PORT/USER/PASS`,
`SENDGRID_API_KEY`); tests use the mocked transport and no real email is
ever sent. Phase 6 adds real revenue: `POST /admin/payments` records
payments (manual/webhook ingress, no gateway) and admin analytics sums only
`completed` rows per currency — zero when no payments are recorded.

## Token lifetimes (implementation choice, not PRD-stated)

- Access JWT: **15 minutes** (`JWT_ACCESS_TTL=15m`)
- Refresh JWT: **7 days** (`JWT_REFRESH_TTL=7d`), rotating, single-use, DB-backed
  `refresh_tokens` table with SHA-256 hash + revocation.

See `docs/architecture.md` for rationale.

## Commands

| Where | Command | Purpose |
|---|---|---|
| backend | `npm run dev` | ts-node-dev / tsx watch server |
| backend | `npm run build && npm start` | compile + run `dist/` |
| backend | `npm run typecheck` | `tsc --noEmit` |
| backend | `npm run lint` | eslint (if configured) |
| backend | `npm test` | Jest + Supertest (pg-mem, no Docker; 15 suites / 159 tests in Phase 7) |
| backend | `npm run migrate` | apply `migrations/*.sql` to `DATABASE_URL` |
| backend | `npm run verify:infra` | real PG/pgvector/Redis/S3/AI checks + RAG isolation (SKIPs when services absent) |
| backend | `npm run verify:compose` | 31 compose-structure assertions (no Docker engine needed) |
| backend | `npm run load:test` | dependency-free load probe (`BASE_URL`, `CONCURRENCY`, `REQUESTS` env; JSON p50/p95/p99 + target verdict) |
| backend | `npm run seed` | seed roles + demo users |
| frontend | `npm run dev` | Vite dev server on `:3000` (proxies `/api` → `VITE_API_URL`) |
| frontend | `npm run typecheck` | `tsc --noEmit` |
| frontend | `npm run build` | `tsc && vite build` → `frontend/dist/` |
| frontend | `npx vitest run` | Vitest (jsdom) — 9 files / 47 tests in Phase 7 (incl. theme/i18n/a11y) |
| ai-service | `pytest` | Pytest with mocked LLM/embeddings (22 tests; no provider key, no live calls) |
| root | `docker compose -f infra/docker-compose.yml up --build` | full local stack |

Never commit `.env`. Only `.env.example` (names, no values) is tracked.

## AI service

```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --port 8000   # GET /health
```

Core backend stays the auth/RBAC gate: the frontend must call
`/api/v1/ai/*` on the backend, never the AI service directly. Backend →
AI service uses `AI_SERVICE_URL` + `x-ai-service-token`. With no
`AI_SERVICE_URL`, the backend uses its built-in deterministic RAG path
(same course-isolation guarantees), so tests need no provider key.

Chunking: sentence-aware 800-char windows with 200-char overlap, max 200
chunks (see `docs/architecture.md`). Embeddings: 1536-dim (Gemini
`gemini-embedding-001` at runtime; deterministic token-hash fallback in
tests/dev, mock LLM in tests — no live provider calls in CI).

## Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000 (VITE_API_URL → backend :4000)
```

Public config is by variable NAME only (`frontend/.env.example`):
`VITE_API_URL`, `VITE_APP_NAME`, `VITE_DEFAULT_LOCALE`. No secrets live in
frontend code; JWTs are held in the Zustand `auth-storage` persist slice and
rotated via the axios 401 interceptor (`POST /api/v1/auth/refresh`).

Student routes (see `frontend/src/routes/index.tsx`): `/dashboard`,
`/courses`, `/courses/:id`, `/courses/:courseId/play/:lectureId`,
`/courses/:courseId/assignments`, `/assignments/:id`,
`/courses/:courseId/quizzes`, `/quizzes/:id/attempt`,
`/quiz-attempts/:id/result`, `/certificates`, `/ai-tutor/:courseId`,
`/study-plan/:courseId`, `/flashcards/:moduleId`.
Instructor routes: `/instructor`, `/instructor/courses`,
`/instructor/courses/new`, `/instructor/courses/:id/edit`,
`/instructor/courses/:id/quizzes`, `/instructor/quiz-drafts`,
`/instructor/assignments/:id/submissions`. Admin workspace: `/admin`,
`/admin/users`, `/admin/courses/pending`, `/admin/analytics`,
`/admin/moderation` (admin-only). Community: `/courses/:courseId/
discussions`, `/courses/:courseId/discussions/:threadId`,
`/notifications`; announcements render on the course detail page for
enrolled users (publish form for the course owner).

Known storage behavior (Phase 6): lecture videos and assignment files flow
through private object storage (MinIO/S3-compatible) via short-lived signed
URLs issued after authorization checks — credentials never reach the
browser. Without storage credentials the backend uses the same bucket/key
layout on local disk. Signed-URL playback is the documented
local-development implementation; production HLS/CDN remains out of scope.

## Phase 7 — final hardening (no new product scope)

- **Dark mode**: class-driven (`darkMode: 'class'`), light/dark/system with
  persisted preference + `prefers-color-scheme` tracking, header toggle,
  AA-measured palette (see Accessibility). Shell + shared components
  (`Button/Card/Input/Badge`, layouts) carry `dark:` variants.
- **i18n scaffolding**: `frontend/src/i18n` (`t()` + `en` dictionary +
  `Locale` abstraction) + persisted locale store + `LanguageSelector`
  foundation. English-only strings (no artificial full translation).
- **Accessibility**: skip link, landmarks (`header/nav/main/aside`,
  `aria-label`/`aria-current`), label↔control association with
  `aria-invalid`/`aria-describedby` + `role="alert"` errors, `aria-pressed`
  theme toggle, `:focus-visible` rings, `prefers-reduced-motion` guard,
  measured contrast ratios (button text 5.53, nav text 5.04, body 14.36,
  dark body 15.29 — all ≥ 4.5; icons/large text ≥ 3.0 kept),
  mobile-viewport Playwright checks. Tests: `src/phase7.test.tsx` (11) +
  `e2e/phase7-responsive.spec.ts` (2).
- **Redis caching** (`backend/src/cache/courseCache.ts`): catalog (60s),
  course metadata (120s), leaderboard (60s); `x-cache: HIT/MISS` headers;
  invalidation on create/update/approval/review. Redis-backed with
  in-memory TTL fallback (tests). Never caches per-user data or secrets.
  Tests: `tests/phase7.test.ts` (hit/miss/invalidation/TTL).
- **Background jobs** (`backend/src/jobs/queue.ts`): Redis-list queue with
  in-memory fallback; kinds `document-ingest`, `video-transcribe`,
  `certificate-generate`, `notification-dispatch`, `recommendation-recalc`,
  `streak-process`; idempotency keys, attempt logging, retry (max 3),
  failure capture, secret-free payloads enforced.
- **Observability**: pino with secret redaction + `service` identity,
  `x-request-id` propagation, duration/status logs, error context
  (requestId/path/method), `GET /healthz` + `/health`, `GET /readyz` +
  `/ready`; AI service mirrors request IDs, latency logs, provider
  error logs, service identity in every line.
- **Rate limiting** (PRD): auth 10/min/IP, AI 20/min/user (inside
  `aiRouter`), global 100/min backstop; Redis fixed-window counters with
  memory fallback; `RateLimit-*` + `Retry-After` headers; 429
  `RATE_LIMITED`. Tests cover auth/AI/authed limits + reset.
- **AI providers**: Gemini Free Tier at runtime (chat `gemini-3.6-flash`,
  embeddings `gemini-embedding-001` @1536) over HTTPS with env-only keys,
  timeout + retry (transient 429/5xx only), latency logs, clear 4xx errors;
  **dimension validation before any pgvector insert** (PRD 1536);
  no-key → deterministic fallback (tests/dev only). Anthropic + Voyage paths
  kept for compat but unused live. Tests stay mocked — no live provider calls
  in CI (stub HTTP servers). Live Gemini verification: embeddings
  `vector_dims()`-proven 1536 in pgvector; grounded chat with valid cites;
  isolation + refusal behavior verified; see "Final handoff" above.
- **Leaderboard**: `GET /api/v1/gamification/leaderboard` (public streak +
  badge aggregates, no PII; Redis-cached 60s; TTL-based refresh rather
  than per-touch invalidation).
- **Performance**: `backend/scripts/load-test.js`
  (`npm run load:test`; `CONCURRENCY`/`REQUESTS` env). Measured vs the
  live stack: 20-concurrency max p95 **28ms**; 100-concurrency max p95
  **131ms** (catalog) — target (non-AI p95 < 300ms) MET. Note: bursts
  beyond the 100/min global limit correctly receive fast 429s by design.
- **Security audit**: refresh rotation single-use (tested), token-type
  separation (tested), RBAC/ownership/IDOR (tested), upload
  allowlist + magic bytes + size caps + 15-min signed URLs, AI course
  isolation + service token + citation stripping, pino secret redaction,
  frontend bundle secret-hygiene test. Known limitation: live access
  tokens stay valid ≤15m after suspend (refresh revoked immediately).
- **CI** (`.github/workflows/ci.yml`): backend (install/typecheck/
  test/build), frontend (install/typecheck/vitest/build), AI service
  (Python 3.11 + pytest, mocked providers), infra (`verify:compose` +
  `docker compose config`). No paid AI calls in CI.
- **Playwright**: installed-browser fallback preserved
  (`PLAYWRIGHT_CHANNEL=msedge`); 5 existing specs + 2 responsive specs
  pass on Edge; `playwright.phase7.config.ts` serves current source on
  :3100 when :3000 is held by the live container.
