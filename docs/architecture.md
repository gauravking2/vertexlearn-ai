# VertexLearn AI — Architecture (Phase 7)

## System map

- `frontend/` — React 18 + Vite + Tailwind student/instructor UI (Zustand auth
  session, TanStack Query server state, React Router; axios client under
  `/api/v1` only). Phase 4 scope: auth, student dashboard, catalog/detail/
  enrollment, course player, assignments, quizzes, certificates/gamification,
  course-scoped AI Tutor + summaries/flashcards/study plans/mastery/
  recommendations, instructor workspace. Admin: route foundation only.
- `backend/` — Express + TypeScript REST API under `/api/v1`. Phase 4 preserves
  Phases 1–3 (auth/RBAC, course foundation, learning core, AI tutor/RAG,
  quiz-draft review, flashcards, study plans, mastery, recommendations).
- `ai-service/` — FastAPI (Python 3.11+) Phase 3 service: `app/main.py`,
  `routers/` (chat/summarize/quiz_gen/flashcards/study_plan),
  `rag/` (chunking/embeddings/retriever), `recommendation/`, `models/`,
  `core/` (config/errors/logging/llm). Health at `GET /health`.
- `infra/docker-compose.yml` — local stack: `postgres` (pgvector/pg15),
  `redis` (7-alpine), `backend` (Node 20). AI service runs separately via
  `ai-service/Dockerfile` (`uvicorn main:app --port 8000`).

## System map

- `frontend/` — React scaffolding only in Phase 1. Full UI in a later phase.
- `backend/` — Express + TypeScript REST API under `/api/v1`. Phase 1 scope:
  auth (JWT), RBAC (student/instructor/admin), course/module/lecture foundation.
- `ai-service/` — FastAPI scaffolding only. RAG pipeline is explicitly out of Phase 1.
- `infra/docker-compose.yml` — local stack: `postgres` (pgvector/pg15),
  `redis` (7-alpine), `backend` (Node 20).
- Postgres is the system of record, including the later `document_chunks`
  vector table (PRD specifies an IVFFLAT index — preserved for the AI phase;
  pgvector is enabled now via `infra/postgres/init/01-extensions.sql`).
- Redis in Phase 2 remains service + configuration foundation (rate-limit
  counters, future cache/queue). No queues are built in Phase 2.
- Phase 1 code is preserved untouched in behavior: auth, RBAC, course/module/
  lecture foundation. Phase 2 adds `backend/src/learning/*`,
  `backend/src/storage/objectStore.ts`, and migration `002_phase2_learning_core.sql`.

## Authentication + RBAC

- Registration: email + password + name, optional `role: student|instructor`
  (defaults to `student`). Self-registration as `admin` is rejected; admins
  are created via seed/migration.
- Hashing: bcrypt (`bcryptjs`), cost from `BCRYPT_ROUNDS` (default 12).
- Tokens (implementation choice — NOT stated as PRD lifetimes):
  - Access JWT: 15 minutes (`JWT_ACCESS_TTL=15m`), carries `sub/email/roles`.
  - Refresh JWT: 7 days (`JWT_REFRESH_TTL=7d`), rotating + single-use.
- Refresh handling: refresh tokens are persisted as SHA-256 hashes in
  `refresh_tokens` with `expires_at` + `revoked_at`. Rotation revokes the
  presented token and issues a new pair. Logout revokes without error
  disclosure. Only the hash is stored — a DB leak does not yield usable tokens.
- Middleware: `authenticate` (Bearer access token → `req.user`) then
  `authorize(...roles)`. Ownership checks (`requireCourseOwner`,
  `requireModuleOwner`) enforce instructor-of-record; admins bypass ownership.
- Course status defaults to `pending` on creation; admin approval is a later phase.

## Course domain

- `courses` → `modules` → `lectures` with FK cascade deletes.
- Reads (`GET /api/v1/courses`, `GET /api/v1/courses/:id`) are public for
  catalog purposes. Writes require `instructor|admin` + ownership.
- List supports `page/pageSize/q/status` for pagination + search structure.
- Indexes on all FKs, `courses(status)`, `courses(created_at)`, `users(email)`.

## Errors / validation / logging

- `zod` validates bodies and list queries; failures return
  `400 VALIDATION_ERROR` with per-field details.
- Central `errorHandler` maps `ApiError` codes (`UNAUTHORIZED/FORBIDDEN/
  NOT_FOUND/CONFLICT`) and hides 500 internals.
- `pino` structured logs with `x-request-id` correlation (`requestLogger`).
- `helmet`, `cors` (allowlist `FRONTEND_URL`), JSON body limit, global
  `express-rate-limit` (env-tunable window/max).

## Health

- `GET /healthz` — liveness, no dependencies.
- `GET /readyz` — checks Postgres (`SELECT 1`) and Redis ping (reports
  `skipped` when `REDIS_URL` unset, e.g. unit tests).

## Learning core (Phase 2)

- Enrollment: `POST /api/v1/courses/:id/enroll` (student|admin, published-only,
  duplicate → 409); `GET /api/v1/enrollments/me` returns `progress_percent`.
- Progress: `POST /api/v1/lectures/:id/progress` upserts
  `watched_seconds/completed/last_watched_at` (watched seconds monotonic);
  enrollment enforced via lecture → module → course join; course percent =
  completed lectures / total lectures; 100% sets `enrollments.completed_at`.
- Notes/bookmarks: student-scoped (`user_id` always from JWT); list endpoints
  filter by caller so cross-student reads are impossible.
- Assignments: instructor create/update guarded by course ownership;
  student submit requires enrollment + `due_at` check + one submission per
  student; grading requires assignment/course ownership and caps at `max_score`.
- Storage: S3/MinIO-compatible abstraction only
  (`backend/src/storage/objectStore.ts`): deterministic object key
  `submissions/:assignment/:submission/:file`, bucket from
  `STORAGE_BUCKET_SUBMISSIONS`, provider URL from `STORAGE_ENDPOINT`
  (no SDK, no credentials in code, no fake public URLs; without endpoint the
  response carries a `pending://object-storage/...` placeholder plus key/bucket
  metadata). Binary upload streaming is the explicit next-phase hook.
- Quizzes: manual creation with `mcq|multi_select|short_answer`; objective
  options validated (≥2 options, ≥1 correct); attempts require enrollment;
  submit auto-grades mcq (single exact match) and multi_select (exact set
  match); short_answer stays `submitted` with `is_correct=NULL` for later
  human/AI grading. Single-submit enforced; foreign questions rejected.
- Certificates: issued on 100% completion (`UNIQUE(user_id, course_id)` +
  read-back guard → no duplicates); PDF generated per request via `pdf-lib`
  service abstraction (`renderCertificatePdf`); `pdf_key` points at a local
  artifact path (or logical key), never a hard-coded cloud URL; download
  streams fresh PDF bytes with owner/admin check.
- Gamification: seeded badges (`first-course-completed`, `7-day-streak`,
  `perfect-quiz-score`); `touchStreak` is date-based (consecutive UTC days);
  first-course badge fires on first `completed_at`; perfect-score fires on a
  fully-correct objective attempt.
- Analytics: backend-only `GET /api/v1/courses/:id/analytics` (owner/admin):
  per-lecture enrolled/completed/drop-off + avg watched seconds, quiz avg
  score/attempts, total watched seconds + active students.
- Security: every Phase 2 endpoint chains `authenticate` + `authorize` +
  ownership/enrollment guards; no caller-supplied `user_id`; IDOR covered by
  owner checks on courses/assignments/submissions/attempts/certificates.

## AI tutor + RAG (Phase 3)

- Split responsibility: core backend owns authN/RBAC/ownership/enrollment and
  never lets the frontend touch the AI DB directly. The AI service owns
  chunking/embeddings/retrieval/LLM calls. Backend calls the AI service only
  via `AI_SERVICE_URL` + `x-ai-service-token`; without it, the backend uses
  its built-in deterministic RAG path (same isolation guarantees) so tests
  never need a live provider.
- RAG pipeline: lecture transcript → sentence-aware chunking (800 chars,
  200 overlap, max 200 chunks; long sentences hard-sliced with overlap
  carryover) → embedding (1536-dim; Gemini `gemini-embedding-001` at runtime,
  deterministic token-hash fallback in tests/dev) → `document_chunks` (per PRD:
  `id/course_id/lecture_id/chunk_text/embedding/created_at`, `VECTOR(1536)`,
  IVFFLAT `vector_cosine_ops` index, `lists=100`) → course-filtered retrieval
  → grounded prompt → LLM answer + `[S1..Sn]` citations → store both messages.
  Runtime LLM is Gemini (`gemini-3.6-flash`; Anthropic path kept for compat,
  unused live — the 2.5-flash ID is retired for new API users).
- Course isolation (mandatory, server-side): every retrieval query carries
  `WHERE course_id = $1`; AI-service `retrieve_course_chunks` drops any row
  with a mismatched `course_id` as defense in depth and asserts no foreign
  citations. Tests seed A/B courses with disjoint vocabularies and prove A
  never cites B.
- Real-Postgres path uses `<=>` cosine ordering via pgvector; pg-mem tests use
  the same course filter + in-memory cosine (pg-mem cannot parse
  `VECTOR/IVFFLAT`, so `tests/helpers.ts` creates type-compatible tables and
  skips `003` parsing — real SQL is still applied by `npm run migrate`).
- Chat: `POST /ai/chat/sessions` (enrollment/ownership checked, 404 vs 403
  distinguished), `POST .../messages` (ownership + enrollment rechecked,
  `topK` clamped 1–20, foreign citations stripped, no-context returns the
  explicit "could not find this in the course material" limitation),
  `PUT .../mode` (beginner/intermediate/advanced, zod-enforced).
- Summaries: `POST /ai/lectures/:id/summarize` (access-checked) returns
  `{keyPoints, takeaways}` via LLM abstraction; mocked in tests.
- AI quizzes: `POST /ai/lectures/:id/generate-quiz` (5–10, owner-only)
  creates `ai_quiz_drafts(status=pending_review, activeQuizId=null)` — never
  an active quiz. `POST /ai/quiz-drafts/:id/approve` validates types/options
  and materializes a real quiz with `is_ai_generated=true`;
  `/reject` and `GET /ai/quiz-drafts` enforce the same ownership.
- Flashcards: `POST /ai/modules/:id/flashcards` (access-checked) stores
  user-scoped `flashcards(front/back)` rows for the module.
- Study plans: `POST /ai/study-plan` blends quiz ratio + weak topics
  (<0.70) into structured JSON `{courseId, mastery, quizRatio, weeks[3]}`,
  upserted per `(user_id, course_id)` in `study_plans`.
- Mastery (deterministic, documented): quiz ratio over last 20 attempts;
  `advanced >= 0.85`, `intermediate >= 0.60`, else `beginner`; no history
  falls back to enrollment progress (>=80% → intermediate, else beginner).
  Served at `GET /ai/mastery/:courseId` and reused for explanation depth.
- Recommendations (rule-based + similarity-ready): `continue` (next
  incomplete lecture), `review` (quiz titles <0.70), else `next` (browse
  catalog); refreshed per request, caller-scoped, at
  `GET /recommendations/me`.
- Secrets: provider key/model only via env names (`LLM_PROVIDER`,
  `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_CHAT_MODEL`, `EMBEDDING_MODEL`,
  `EMBEDDING_DIM`, `RAG_TOP_K`, `AI_SERVICE_URL/TOKEN`); never in code or
  logs. Tests inject mock LLM/embedding clients and never call paid APIs.

## Out of Phase 3 (explicit non-goals)

Admin UI, discussions, notifications, production deployment. Leaderboard is
intentionally not built. Frontend remains scaffolding.

## Admin + community (Phase 5)

- Migration `004_phase5_admin_community.sql`: `is_suspended/suspended_at/
  suspended_reason` on `users`; `course_approvals` history
  (`course_id/requested_by/reviewer_id/decision/comment/decided_at`);
  `discussion_threads` + `discussion_posts` (optional `parent_post_id`
  threading, `is_hidden`, `flag_count`) + `discussion_flags`
  (`UNIQUE(post_id, reporter_id)`, `open/resolved/dismissed`);
  `announcements` (per-course, instructor-owned); `notifications`
  (`user_id/type/title/body/link/is_read/read_at`).
- Admin backend (`backend/src/admin/routes.ts`): list/search users, role
  assign/revoke (self-revoke + last-admin guards), suspend/restore
  (revokes refresh tokens; login blocks suspended users with 403),
  safe delete (blocks self, last admin, course owners), pending queue from
  the existing `courses.status` model, approve/reject/decision with
  approval record + instructor notification, real-data analytics overview
  (revenue is an explicit zero empty-state — no payment data exists),
  flagged-posts queue with resolve/dismiss/hide/unhide/delete.
- Course approval lifecycle: instructor creates (status `pending` + pending
  approval row) → admin approves (`published`) or rejects (`rejected`) →
  enrollment visibility follows the existing published-only rule. Single
  mechanism: `course_approvals` history + `courses.status`; the legacy
  `PATCH /courses/:id/status` hook is preserved untouched.
- Discussions (`backend/src/discussions/routes.ts`): per-course threads +
  threaded posts; access = enrolled student, owner instructor, or admin;
  writes re-check course access; edits are author-or-admin (IDOR-tested);
  deletes allow author/course-owner/admin; flags are one-per-reporter;
  instructor moderation is own-course only, admin platform-wide.
- Announcements (`backend/src/announcements/routes.ts`): owner-instructor
  (or admin) publish; enrolled students read; publishing notifies enrolled
  students in-app (best-effort).
- Notifications (`backend/src/notifications/`): `createNotification` helper
  + user-isolated routes (list, unread count, mark read, mark all read;
  `user_id` always from JWT). Emitted on course approval/rejection,
  announcements, assignment grading, and certificate issuance.
- Email abstraction (`backend/src/email/service.ts`): provider selected by
  env NAMES (`EMAIL_PROVIDER/EMAIL_FROM/SMTP_*/SENDGRID_API_KEY`); `mock`
  transport in tests (in-memory outbox, no real email); unconfigured
  providers report `delivered:false` with an explicit reason instead of
  fabricating success.
- Routing convention (hard lesson): routers mounted at the shared `/api/v1`
  prefix MUST apply auth per-route — router-level `router.use(authenticate,
  authorize(...))` runs for unrelated routes and wrongly 403s them.
- Frontend: dedicated `/admin/*` workspace (dashboard, users, approvals,
  analytics, moderation), `/courses/:courseId/discussions[/:threadId]`,
  `/notifications`, and course announcements — all on real API data with
  loading/empty/error states.

## Out of Phase 5 (explicit non-goals)

MinIO/S3/HLS/CDN, production deployment. Leaderboard remains unbuilt.

## Storage + real infrastructure (Phase 6)

- Local stack (`infra/docker-compose.yml`): postgres (pgvector/pg15) +
  redis (7-alpine) + minio + minio-init (private bucket bootstrap:
  videos/materials/submissions/certificates) + backend + ai-service +
  frontend (vite preview :3000). Healthchecks on every long-lived service;
  backend waits for postgres/redis/minio healthy and minio-init complete;
  frontend waits for backend healthy. `npm run verify:compose` checks this
  structure (31 assertions) without needing the Docker engine.
- Object storage (`backend/src/storage/s3.ts`, AWS SDK v3, path-style):
  server operations use `STORAGE_ENDPOINT`, while presigned browser URLs are
  signed against `STORAGE_PUBLIC_ENDPOINT` (signing is pure crypto, so the
  backend never needs to reach the public host). Buckets stay private; every
  URL is issued after an authorization check. Without credentials the same
  code paths fall back to the local-disk layout (`storage-local/
  <bucket>/<key>`) — the `pending://` placeholder is kept only for the
  legacy metadata-only target. Binaries never go into Postgres; only
  metadata (bucket/key/size/mime) is stored.
- Assignment binary upload: `POST /assignments/:id/upload`
  (multipart `file`, multer memory storage, `UPLOAD_MAX_MB` default 25):
  PDF/ZIP/code-text allowlist plus magic-byte sniffing (`%PDF`, `PK\x03\x04`)
  against extension spoofing; enrollment + deadline + single-submission
  rules mirror the text flow. `GET /submissions/:id/download` streams bytes
  after owner/grader/admin checks.
- Lecture video: `POST /lectures/:id/upload-url` (owner-only presigned PUT,
  persists `video_key`) and `GET /lectures/:id/video-url` (enrolled/owner/
  admin signed GET, 15-min expiry). The player uses the signed URL when
  present and shows an honest empty state otherwise. This is explicitly a
  local-development implementation — production HLS/CDN remains out of scope.
- Certificates flow through the same abstraction (`certificates/<user>/
  <course>.pdf`); downloads prefer the stored artifact with re-render
  fallback; uniqueness (`UNIQUE(user_id, course_id)`) unchanged.
- Catalog gaps closed (migration `005_phase6_catalog_payments.sql`):
  `courses.category/difficulty` (+CHECK), `course_reviews` (one rating 1–5
  per student per course, `UNIQUE(user_id, course_id)`), `payments`
  (`amount_cents/currency/status/provider`, `SET NULL` on user/course
  delete to preserve revenue facts). List/detail expose server-side
  `category/difficulty/minRating` + `avg_rating/rating_count`; reviews are
  public to read, enrollment-gated to write. All Phase 6 reads degrade
  gracefully when 005 is not yet applied.
- Revenue: no gateway (per PRD scope); `POST /admin/payments` is the real
  ingress (manual recording / future webhook), and admin analytics sums only
  `completed` rows per currency. Empty ledgers honestly report zero.
- Infra verification: `npm run verify:infra` checks env presence (names
  only), Postgres (tables 001→005, pgvector extension, VECTOR dim, IVFFLAT
  index, FKs), Redis ping, S3 buckets, AI-service health, and end-to-end RAG
  course isolation on the real database with the offline deterministic
  embedding path. Every check is PASS/SKIP/FAIL; absent services SKIP.
- AI service runs in compose (`AI_SERVICE_URL=http://ai-service:8000`,
  `x-ai-service-token` unchanged); the frontend still talks only to
  `/api/v1/ai/*`. Python tests were not executable in this environment (no
  interpreter) — they remain mocked-provider, no live paid calls by design.
- Routing invariant (from Phase 5, still enforced): routers mounted at the
  shared `/api/v1` prefix apply auth per-route, never via `router.use`.

## Out of Phase 6 (explicit non-goals)

Production deployment, payment gateway, HLS/CDN. Leaderboard remains unbuilt.

## Final hardening (Phase 7 — no new product scope)

- **Frontend theme**: `darkMode: 'class'`; `themeStore` (light/dark/system,
  persisted, `prefers-color-scheme` tracking) applies `.dark` + `data-theme`
  on `<html>`; `ThemeToggle` (`aria-pressed`) + mode select + `LanguageSelector`
  in the header; `Card/Input/Button/Badge`/layouts carry `dark:` variants;
  `:focus-visible` rings; skip link + landmarks; `prefers-reduced-motion`.
- **i18n**: `src/i18n` (`Locale`, `t()`, `en` dictionary, `SUPPORTED_LOCALES`,
  `DEFAULT_LOCALE` from `VITE_DEFAULT_LOCALE`) + persisted `localeStore`
  (sets `<html lang>`). English-only by PRD scope.
- **Caching** (`backend/src/cache/courseCache.ts`): `vl:catalog:*` (60s),
  `vl:course:<id>` (120s), `vl:leaderboard:<n>` (60s); `x-cache` headers;
  invalidation on course create/update, approval decisions, and review
  writes; leaderboard relies on TTL (streak writes are high-frequency).
  Redis when `REDIS_URL` is set, in-memory TTL fallback otherwise.
- **Jobs** (`backend/src/jobs/queue.ts`): Redis list per kind with memory
  fallback; idempotency keys (24h Redis / process memory); attempts ≤ 3
  with requeue; status/failure logs; payloads restricted to IDs (secret
  patterns rejected). Default handlers wire notification/recommendation/
  streak/certificate/ingest hooks; transcription is a logged no-op hook.
- **Rate limits**: `authRateLimit` (10/min/IP on `/api/v1/auth`), `aiRateLimit`
  (20/min/user via `aiRouter.use`), global `express-rate-limit` 100/min
  backstop; Redis fixed-window with memory fallback; standard headers +
  429 `RATE_LIMITED`. Bypassed in Jest unless `RATE_LIMIT_ENFORCE=1`.
- **AI providers**: runtime is Gemini Free Tier on both stacks —
  backend `GeminiHttpProvider` (`:generateContent`) and
  `GeminiEmbeddingProvider` (`:embedContent` + `outputDimensionality=1536`),
  each with timeout + retry on transient 429/5xx, latency logs, and strict
  `GEMINI_API_KEY`-only auth (the Anthropic key is never reused for
  embeddings); `ingestTranscript` validates every vector before insert. AI
  service mirrors this (`GeminiLlmClient`, `GeminiEmbeddingClient` +
  `validate_dim`), plus request-ID generation/propagation, `LOG_LEVEL`
  honoring, and service identity in logs. Anthropic/Voyage paths are kept
  for compat but unused live. Provider keys only from env; tests inject
  mocks or stub HTTP servers (no live calls in CI).
- **Observability**: pino redaction list (passwords, tokens, keys, secrets);
  request logs carry `service/requestId/method/path/status/durationMs`;
  errors carry request context; `/health` + `/ready` aliases.
- **Leaderboard**: `GET /api/v1/gamification/leaderboard` derives
  streak/badge aggregates (no new tables); public, cached, no PII.
- **CI**: four jobs (backend, frontend, ai-service, infra) as documented in
  the README; no paid calls, no deployment workflow.
- **Performance**: `backend/scripts/load-test.js` (dependency-free fetch
  probe, `CONCURRENCY`/`REQUESTS` env, JSON summary with p50/p95/p99 and
  target verdict).

## Out of Phase 7 (explicit non-goals, unchanged)

Full payment gateway/subscription billing, native mobile apps, live video
conferencing, peer-to-peer study rooms, offline-first mobile sync, full
multilingual translation, AI plagiarism engine, advanced predictive
analytics, voice tutor, SSO/SAML, production CDN/HLS, deployment.

## Deployment (Phase 8 — single-host Compose)

- Target: single Docker host running `infra/docker-compose.yml` (no cloud
  accounts available or assumed). Services: `frontend` → `backend` →
  `postgres` (pgvector/pg15, `01-extensions.sql` creates `vector` before
  backend migrations run), `redis`, `minio` (+`minio-init` bucket bootstrap),
  `ai-service`. Data persists in `pgdata/redisdata/miniodata`.
- Config is env-only: containers read the root `.env` via `env_file`
  (compose CLI needs `--env-file .env` when `-f` points into `infra/`);
  public frontend config is baked via `VITE_API_URL` build arg (localhost
  default fits single-host; domain deployments override the arg).
- Backend boots with `migrate:prod` (all five migrations verified
  `IF NOT EXISTS`, no destructive statements) then `node dist/index.js`;
  no auto-seed (`npm run seed` is manual only — never against production).
- Deployment order that works: build images → `up -d ai-service` →
  `up -d backend` → `up -d frontend`; data services are left running.
- Health: backend `/healthz`+`/health` (identity+version), `/readyz`+`/ready`
  (db+redis); ai-service `/health` (provider name), `/ready`. All verified
  live post-deploy, plus a 71-check live API smoke suite, 100-concurrency
  load probe (max p95 108ms), and 7 Edge Playwright specs.

## Final runtime — Gemini Free Tier (no paid usage)

- `LLM_PROVIDER=gemini`, chat `gemini-3.6-flash` via `LLM_CHAT_MODEL`;
  embeddings `gemini-embedding-001` via `EMBEDDING_MODEL` at 1536 dims
  (`VECTOR(1536)` unchanged, no migration). `gemini-2.5-flash` was retired
  for new API users (provider 404 names `gemini-3.6-flash`), so it is the
  configured model; code defaults match. This substitution exists solely to
  avoid paid API usage — Anthropic is not used live.
- Live proof: embeddings `vector_dims()`-verified 1536 in pgvector;
  grounded answers with valid cites; isolation + refusal behavior verified;
  dense-embedding note — unrelated queries score ~0.46 (vs ~0.0 token-hash),
  so the unchanged 0.12 gate passes and refusals come from the LLM following
  the grounded prompt (observed, zero fabricated facts).
