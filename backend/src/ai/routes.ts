import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../auth/middleware';
import { db, newId } from '../db/pool';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../errors';
import { validateBody } from '../middleware/validate';
import { requireCourseOwner } from '../courses/ownership';
import { getLectureCourse, isEnrolled } from '../learning/guards';
import { touchStreak } from '../learning/progress';
import {
  aiServiceDiagnostics,
  aiServiceHost,
  callAiServiceChat,
  callAiServiceGenerate,
  isAiServiceBreakerOpen,
  isAiServiceConfigured,
  pingAiService,
} from './client';
import { logger } from '../logger';
import { getEmbeddingProvider, parseEmbedding, serializeEmbedding } from './embeddings';
import {
  buildGroundedSystemPrompt,
  buildGroundedUserPrompt,
  chatWithFallback,
  getLlmProvider,
  getLlmProviderName,
  getProviderChain,
  stripForeignCitations,
  type ExplanationMode,
} from './llm';
import { courseMastery, masteryLevelFromRatio, quizScoreRatio } from './mastery';
import { refreshRecommendationsForUser } from './recommend';
import { hasRetrievalSupport, ingestTranscript, retrieveCourseChunks, toCitations } from './retriever';
import { aiRateLimit } from '../middleware/rateLimit';

export const aiRouter = Router();

// PRD: AI chat/generation at 20 req/min/user (Redis-backed when configured).
aiRouter.use(aiRateLimit());

const MODES = ['beginner', 'intermediate', 'advanced'] as const;

const sessionSchema = z.object({
  courseId: z.string().uuid(),
  mode: z.enum(MODES).default('beginner'),
});

const messageSchema = z.object({
  content: z.string().min(1).max(10000),
  topK: z.number().int().min(1).max(20).optional(),
});

const modeSchema = z.object({ mode: z.enum(MODES) });

const transcriptSchema = z.object({
  transcript: z.string().min(1).max(200000),
});

const quizGenSchema = z.object({
  count: z.number().int().min(5).max(10).default(5),
});

const studyPlanSchema = z.object({
  courseId: z.string().uuid(),
});

async function requireCourseAccessOr404(courseId: string, user: { id: string; roles: string[] }): Promise<{ instructorId: string } | null> {
  const res = await db.query(`SELECT instructor_id FROM courses WHERE id = $1`, [courseId]);
  const row = res.rows[0] as { instructor_id: string } | undefined;
  if (!row) return null;
  if (user.roles.includes('admin') || user.id === row.instructor_id) return { instructorId: row.instructor_id };
  if (await isEnrolled(user.id, courseId)) return { instructorId: row.instructor_id };
  return null;
}

function noContextAnswer(): string {
  return 'I could not find this in the course material. The retrieved lectures do not cover your question, so I will not guess. Try rephrasing, or check whether the topic is covered in a different lecture.';
}

/**
 * Deterministic last-resort answer used ONLY when retrieval already found
 * supporting course material but every configured chat provider failed
 * (rate-limited, no key, or the provider network is unreachable from this
 * host). It quotes the retrieved passages with their citations, so the answer
 * stays grounded and course-scoped and the Tutor never dies mid-question.
 */
function buildExtractiveAnswer(citations: { ref: string; lectureTitle: string; text: string }[]): string {
  const passages = citations.slice(0, 3).map((c) => {
    const text = c.text.replace(/\s+/g, ' ').trim().slice(0, 320);
    return `[${c.ref}] (${c.lectureTitle}) ${text}`;
  });
  return [
    'The AI provider is temporarily unavailable, so here are the most relevant passages from this course material:',
    '',
    ...passages,
  ].join('\n');
}

/**
 * Map an LLM/AI-service failure to a safe API error. Never leaks stack traces,
 * provider bodies, headers, URLs, or key material — only a coarse category.
 * 429 (or provider rate-limit text) → 429 RATE_LIMITED; 401-style config
 * problems → 503 AI_NOT_CONFIGURED; malformed requests → 400 AI_BAD_REQUEST;
 * upstream timeouts → 504 AI_TIMEOUT; everything else → 503
 * PROVIDER_UNAVAILABLE. Works for both the direct LLM path ("LLM provider
 * error: <status>") and the ai-service proxy path ("AI service error:
 * <status> <CODE>").
 */
function aiProviderError(err: unknown): ApiError {
  const message = err instanceof Error ? err.message : String(err);
  const llm = /LLM provider error: (\d{3})/.exec(message);
  const svc = /AI service error: (\d{3})(?: ([A-Z_]+))?/.exec(message);
  const status = llm ? Number(llm[1]) : svc ? Number(svc[1]) : undefined;
  const code = svc?.[2] ?? '';
  if (status === 429 || /rate.?limit/i.test(message)) {
    return new ApiError(429, 'RATE_LIMITED', 'AI Tutor is temporarily rate-limited. Please try again shortly.');
  }
  if (code === 'AI_NOT_CONFIGURED' || (status !== undefined && [401, 403].includes(status))) {
    return new ApiError(503, 'AI_NOT_CONFIGURED', 'AI Tutor configuration is invalid. Please contact the administrator.');
  }
  if (code === 'AI_BAD_REQUEST' || status === 400) {
    return new ApiError(400, 'AI_BAD_REQUEST', 'The AI Tutor request could not be processed.');
  }
  if (code === 'AI_TIMEOUT' || status === 504) {
    return new ApiError(504, 'AI_TIMEOUT', 'AI Tutor took too long to respond. Please try again.');
  }
  if (/timed out|timeout|abort/i.test(message)) {
    return new ApiError(504, 'AI_TIMEOUT', 'AI Tutor took too long to respond. Please try again.');
  }
  if (/AI_TUTOR_API_KEY|GEMINI_API_KEY|not configured/i.test(message)) {
    return new ApiError(503, 'AI_NOT_CONFIGURED', 'AI Tutor configuration is invalid. Please contact the administrator.');
  }
  return new ApiError(503, 'PROVIDER_UNAVAILABLE', 'AI Tutor is temporarily unavailable. Please try again.');
}

aiRouter.get('/ai/warmup', authenticate, async (_req, res) => {
  // Pre-warm WITHOUT blocking the chat path: opening the Tutor page fires
  // this in the background (bounded 60s) so a sleeping free-tier AI service
  // boots BEFORE the user sends a message. The chat request itself is a
  // single attempt (no double-wait); the UI retry lands on a warm service.
  // Never exposes the AI service or its token (server-to-server only).
  if (!isAiServiceConfigured()) {
    res.json({ warm: false, reason: 'AI service is not configured' });
    return;
  }
  const warm = await pingAiService(60000);
  res.json({ warm });
});

aiRouter.post('/ai/chat/sessions', authenticate, authorize('student', 'instructor', 'admin'), validateBody(sessionSchema), async (req, res, next) => {
  try {
    const body = req.body as { courseId: string; mode: ExplanationMode };
    const access = await requireCourseAccessOr404(body.courseId, { id: req.user!.id, roles: req.user!.roles });
    if (!access) {
      const exists = await db.query(`SELECT id FROM courses WHERE id = $1`, [body.courseId]);
      if (!exists.rowCount) {
        next(notFound('Course not found'));
        return;
      }
      next(forbidden('Enrollment required'));
      return;
    }
    const id = newId();
    await db.query(`INSERT INTO ai_chat_sessions (id, user_id, course_id, mode) VALUES ($1, $2, $3, $4)`, [id, req.user!.id, body.courseId, body.mode]);
    const created = await db.query(`SELECT id, user_id, course_id, mode, created_at FROM ai_chat_sessions WHERE id = $1`, [id]);
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

aiRouter.put('/ai/chat/sessions/:id/mode', authenticate, validateBody(modeSchema), async (req, res, next) => {
  try {
    const sessionRes = await db.query(`SELECT id, user_id, course_id, mode FROM ai_chat_sessions WHERE id = $1`, [req.params.id]);
    const session = sessionRes.rows[0] as { id: string; user_id: string; course_id: string; mode: string } | undefined;
    if (!session) {
      next(notFound('Chat session not found'));
      return;
    }
    if (session.user_id !== req.user!.id && !req.user!.roles.includes('admin')) {
      next(forbidden('You do not own this session'));
      return;
    }
    const body = req.body as { mode: ExplanationMode };
    await db.query(`UPDATE ai_chat_sessions SET mode = $1, updated_at = now() WHERE id = $2`, [body.mode, session.id]);
    const updated = await db.query(`SELECT id, user_id, course_id, mode FROM ai_chat_sessions WHERE id = $1`, [session.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/ai/chat/sessions/:id/messages', authenticate, validateBody(messageSchema), async (req, res, next) => {
  try {
    const sessionRes = await db.query(`SELECT id, user_id, course_id, mode FROM ai_chat_sessions WHERE id = $1`, [req.params.id]);
    const session = sessionRes.rows[0] as { id: string; user_id: string; course_id: string; mode: ExplanationMode } | undefined;
    if (!session) {
      next(notFound('Chat session not found'));
      return;
    }
    if (session.user_id !== req.user!.id && !req.user!.roles.includes('admin')) {
      next(forbidden('You do not own this session'));
      return;
    }
    const access = await requireCourseAccessOr404(session.course_id, { id: req.user!.id, roles: req.user!.roles });
    if (!access) {
      next(forbidden('Enrollment required'));
      return;
    }
    const body = req.body as { content: string; topK?: number };
    const topK = body.topK ?? 5;
    const userMessageId = newId();
    await db.query(`INSERT INTO ai_chat_messages (id, session_id, role, content) VALUES ($1, $2, 'user', $3)`, [userMessageId, session.id, body.content]);

    // Retrieval MUST NOT be a second failure point: run it best-effort so an
    // embedding outage can never turn a good provider call into a 503.
    let localSources: { id: string; lectureId: string | null; lectureTitle: string; chunkIndex: number; text: string; score: number }[] = [];
    try {
      const retrieved = await retrieveCourseChunks(session.course_id, body.content, topK);
      localSources = retrieved.filter((s) => s.text && s.text.length > 0);
    } catch {
      localSources = [];
    }
    const localAllowedRefs = new Set(localSources.map((_, i) => `[S${i + 1}]`));
    let answer: string;
    let grounded: boolean;
    // Answer path: prefer the AI service (course-scoped RAG over pgvector).
    // Fallback: when the remote call fails OR returns an empty answer (e.g.
    // the AI service has no DB rows / provider key on its side), answer
    // locally from the backend's own retrieval + chat provider instead of
    // 503ing a question the course material can actually answer. In tests
    // the AI service is unset, so the local path stays available.
    let answerPath = 'local-rag';
    if (isAiServiceConfigured() && !isAiServiceBreakerOpen()) {
      const remoteStarted = Date.now();
      try {
        const remote = await callAiServiceChat({ courseId: session.course_id, question: body.content, mode: session.mode, topK });
        if (remote && typeof remote.answer === 'string' && remote.answer.trim()) {
          const remoteRefs = new Set((remote.sources ?? []).map((s) => s.ref));
          answer = stripForeignCitations(remote.answer, new Set([...localAllowedRefs, ...remoteRefs]));
          grounded = remote.grounded;
          const remoteSources = (remote.sources ?? []).map((s) => ({
            id: `${s.ref}`,
            lectureId: s.lectureId,
            lectureTitle: s.lectureTitle,
            chunkIndex: s.chunkIndex,
            text: '',
            score: s.score,
          }));
          const remoteSourceRows = remoteSources.map((s, i) => ({
            ref: `S${i + 1}`,
            lectureId: s.lectureId,
            lectureTitle: s.lectureTitle,
            chunkIndex: s.chunkIndex,
            score: Number(s.score ?? 0),
          }));
          const remoteAssistantId = newId();
          await db.query(`INSERT INTO ai_chat_messages (id, session_id, role, content, sources) VALUES ($1, $2, 'assistant', $3, $4)`, [
            remoteAssistantId,
            session.id,
            answer,
            JSON.stringify(remoteSourceRows),
          ]);
          await touchStreak(req.user!.id);
          logger.info({ courseId: session.course_id, path: 'ai-service', latencyMs: Date.now() - remoteStarted }, 'AI Tutor answered via ai-service');
          res.status(201).json({
            userMessageId,
            assistantMessageId: remoteAssistantId,
            answer,
            grounded,
            mode: session.mode,
            sources: remoteSourceRows,
            provider: 'ai-service',
          });
          return;
        }
        logger.warn({ courseId: session.course_id, latencyMs: Date.now() - remoteStarted }, 'AI service empty answer — falling back to local RAG path');
      } catch (err) {
        // Fail over to the local RAG path below for transport/provider
        // errors; only fail closed when the local path cannot answer either.
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - remoteStarted },
          'AI service call failed — falling back to local RAG path',
        );
      }
    } else if (isAiServiceConfigured()) {
      logger.info({ courseId: session.course_id }, 'AI service circuit breaker open — answering from local RAG path');
    }
    if (!hasRetrievalSupport(localSources)) {
      answer = noContextAnswer();
      grounded = false;
    } else {
      const citations = toCitations(localSources);
      const localStarted = Date.now();
      let raw: string;
      try {
        const result = await chatWithFallback({
          system: buildGroundedSystemPrompt(session.mode),
          user: buildGroundedUserPrompt(body.content, citations),
        });
        raw = result.answer;
        answerPath = `local-rag:${result.provider}`;
        logger.info(
          { courseId: session.course_id, provider: result.provider, attempts: result.attempts, latencyMs: Date.now() - localStarted },
          'AI Tutor answered via local RAG path',
        );
      } catch (err) {
        const mapped = aiProviderError(err);
        if (mapped.code === 'AI_NOT_CONFIGURED') {
          // A genuine misconfiguration (missing/invalid provider key) must stay
          // visible instead of being masked by a fallback answer.
          next(mapped);
          return;
        }
        // Transient failure (timeout / rate limit / provider outage): answer
        // extractively from the retrieved course material rather than 5xx-ing
        // a question the course content demonstrably covers.
        logger.warn(
          {
            err: err instanceof Error ? err.message : String(err),
            attempts: (err as { attempts?: unknown }).attempts,
            latencyMs: Date.now() - localStarted,
          },
          'all AI providers failed — answering extractively from course material',
        );
        raw = buildExtractiveAnswer(citations);
        answerPath = 'local-extractive';
      }
      answer = stripForeignCitations(raw, localAllowedRefs);
      grounded = true;
    }
    const sourceRows = localSources.map((s, i) => ({
      ref: `S${i + 1}`,
      lectureId: s.lectureId,
      lectureTitle: s.lectureTitle,
      chunkIndex: s.chunkIndex,
      score: Number(s.score ?? 0),
    }));
    const assistantId = newId();
    await db.query(`INSERT INTO ai_chat_messages (id, session_id, role, content, sources) VALUES ($1, $2, 'assistant', $3, $4)`, [
      assistantId,
      session.id,
      answer,
      JSON.stringify(sourceRows),
    ]);
    await touchStreak(req.user!.id);
    res.status(201).json({
      userMessageId,
      assistantMessageId: assistantId,
      answer,
      grounded,
      mode: session.mode,
      sources: sourceRows,
      provider: answerPath,
    });
  } catch (err) {
    next(err);
  }
});

aiRouter.get('/ai/chat/sessions/:id/messages', authenticate, async (req, res, next) => {
  try {
    const sessionRes = await db.query(`SELECT id, user_id FROM ai_chat_sessions WHERE id = $1`, [req.params.id]);
    const session = sessionRes.rows[0] as { id: string; user_id: string } | undefined;
    if (!session) {
      next(notFound('Chat session not found'));
      return;
    }
    if (session.user_id !== req.user!.id && !req.user!.roles.includes('admin')) {
      next(forbidden('You do not own this session'));
      return;
    }
    const rows = await db.query(`SELECT id, role, content, sources, created_at FROM ai_chat_messages WHERE session_id = $1 ORDER BY created_at`, [session.id]);
    res.json({ data: rows.rows });
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/ai/lectures/:id/transcript', authenticate, authorize('instructor', 'admin'), validateBody(transcriptSchema), async (req, res, next) => {
  try {
    const ref = await getLectureCourse(req.params.id);
    if (!ref) {
      next(notFound('Lecture not found'));
      return;
    }
    if (!req.user!.roles.includes('admin') && ref.instructorId !== req.user!.id) {
      next(forbidden('You do not own this course'));
      return;
    }
    const body = req.body as { transcript: string };
    await db.query(
      `INSERT INTO lecture_transcripts (lecture_id, transcript) VALUES ($1, $2) ON CONFLICT (lecture_id) DO UPDATE SET transcript = EXCLUDED.transcript, updated_at = now()`,
      [req.params.id, body.transcript],
    );
    const chunks = await ingestTranscript(ref.courseId, req.params.id, body.transcript);
    res.status(201).json({ lectureId: req.params.id, courseId: ref.courseId, chunks });
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/ai/lectures/:id/summarize', authenticate, async (req, res, next) => {
  try {
    const ref = await getLectureCourse(req.params.id);
    if (!ref) {
      next(notFound('Lecture not found'));
      return;
    }
    const access = await requireCourseAccessOr404(ref.courseId, { id: req.user!.id, roles: req.user!.roles });
    if (!access) {
      next(forbidden('Enrollment required'));
      return;
    }
    const transcriptRes = await db.query(`SELECT transcript FROM lecture_transcripts WHERE lecture_id = $1`, [req.params.id]);
    const transcript = (transcriptRes.rows[0] as { transcript: string } | undefined)?.transcript ?? '';
    if (!transcript) {
      next(notFound('No transcript indexed for this lecture'));
      return;
    }
    if (isAiServiceConfigured() && !isAiServiceBreakerOpen()) {
      try {
        const remote = await callAiServiceGenerate<{ summary: { keyPoints: string[]; takeaways: string[] } }>(`/v1/summarize`, {
          lecture_id: req.params.id,
          transcript: transcript.slice(0, 20000),
        });
        res.json({ lectureId: req.params.id, summary: remote.summary, provider: 'ai-service' });
        return;
      } catch (err) {
        // Fall through to the local summarizer instead of failing the request.
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'ai-service summarize failed — using local LLM');
      }
    }
    const llm = getLlmProvider();
    const answer = await llm.chat({
      system: 'You summarize course lectures into structured key points. Use only the provided transcript. Return JSON with keyPoints (5-8 bullets) and takeaways (2-3 bullets).',
      user: `Transcript:\n${transcript.slice(0, 12000)}`,
      maxTokens: 800,
    });
    const keyPoints = answer
      .split('\n')
      .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter((l) => l.length > 3)
      .slice(0, 8);
    res.json({ lectureId: req.params.id, summary: { keyPoints, takeaways: keyPoints.slice(-2) }, provider: 'local-llm' });
  } catch (err) {
    next(err);
  }
});

aiRouter.post(
  '/ai/lectures/:id/generate-quiz',
  authenticate,
  authorize('instructor', 'admin'),
  validateBody(quizGenSchema),
  async (req, res, next) => {
    try {
      const ref = await getLectureCourse(req.params.id);
      if (!ref) {
        next(notFound('Lecture not found'));
        return;
      }
      if (!req.user!.roles.includes('admin') && ref.instructorId !== req.user!.id) {
        next(forbidden('You do not own this course'));
        return;
      }
      const transcriptRes = await db.query(`SELECT transcript FROM lecture_transcripts WHERE lecture_id = $1`, [req.params.id]);
      const transcript = (transcriptRes.rows[0] as { transcript: string } | undefined)?.transcript ?? '';
      if (!transcript) {
        next(notFound('No transcript indexed for this lecture'));
        return;
      }
      const body = req.body as { count: number };
      const questionList: { type: string; prompt: string; points: number; options?: { text: string; isCorrect: boolean }[] }[] = [];
      let questions: typeof questionList | null = null;
      if (isAiServiceConfigured() && !isAiServiceBreakerOpen()) {
        try {
          const remote = await callAiServiceGenerate<{ questions: typeof questionList }>(`/v1/quiz-gen`, {
            lecture_id: req.params.id,
            transcript: transcript.slice(0, 20000),
            count: body.count,
          });
          questions = Array.isArray(remote.questions) && remote.questions.length ? remote.questions : null;
        } catch (err) {
          // Fall through to the deterministic local generator.
          logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'ai-service quiz generation failed — using local generator');
        }
      }
      if (!questions) {
        const crypto = await import('node:crypto');
        const chunks = await retrieveCourseChunks(ref.courseId, transcript.slice(0, 2000), Math.min(body.count, 10));
        const palette = chunks.length ? chunks : [{ text: transcript.slice(0, 800) }];
        questions = palette.slice(0, body.count).map((c, i) => {
          const text = c.text.split('. ').slice(0, 2).join('. ').slice(0, 220);
          const kind = i % 3 === 2 ? 'short_answer' : i % 3 === 1 ? 'multi_select' : 'mcq';
          if (kind === 'short_answer') return { type: kind, prompt: `Explain in your own words: ${text}?`, points: 2 };
          if (kind === 'multi_select') {
            return {
              type: kind,
              prompt: `Which statements about this lecture are supported? "${text}"`,
              points: 2,
              options: [
                { text: 'Supported by the lecture material', isCorrect: true },
                { text: 'Also supported by the lecture material', isCorrect: true },
                { text: 'Contradicts the lecture material', isCorrect: false },
              ],
            };
          }
          return {
            type: kind,
            prompt: `What is the main point of: "${text}"?`,
            points: 1,
            options: [
              { text: 'The stated lecture point', isCorrect: true },
              { text: `Unrelated distractor ${crypto.randomUUID().slice(0, 4)}`, isCorrect: false },
            ],
          };
        });
      }
      const id = newId();
      await db.query(
        `INSERT INTO ai_quiz_drafts (id, course_id, lecture_id, created_by, status, payload) VALUES ($1, $2, $3, $4, 'pending_review', $5)`,
        [id, ref.courseId, req.params.id, req.user!.id, JSON.stringify({ questions, generatedAt: new Date().toISOString() })],
      );
      const created = await db.query(`SELECT id, course_id, lecture_id, status, payload, created_at FROM ai_quiz_drafts WHERE id = $1`, [id]);
      const row = created.rows[0] as { payload: string } & Record<string, unknown>;
      res.status(201).json({ ...(row as object), payload: JSON.parse(row.payload as string), activeQuizId: null });
    } catch (err) {
      next(err);
    }
  },
);

aiRouter.post('/ai/quiz-drafts/:id/approve', authenticate, authorize('instructor', 'admin'), async (req, res, next) => {
  try {
    const draftRes = await db.query(`SELECT id, course_id, lecture_id, status, payload FROM ai_quiz_drafts WHERE id = $1`, [req.params.id]);
    const draft = draftRes.rows[0] as { id: string; course_id: string; lecture_id: string | null; status: string; payload: string } | undefined;
    if (!draft) {
      next(notFound('Quiz draft not found'));
      return;
    }
    if (draft.status !== 'pending_review') {
      next(conflict('Draft is not pending review'));
      return;
    }
    const courseRes = await db.query(`SELECT instructor_id FROM courses WHERE id = $1`, [draft.course_id]);
    const instructorId = (courseRes.rows[0] as { instructor_id: string } | undefined)?.instructor_id;
    if (!req.user!.roles.includes('admin') && instructorId !== req.user!.id) {
      next(forbidden('You do not own this course'));
      return;
    }
    const payload = JSON.parse(draft.payload) as {
      questions: { type: 'mcq' | 'multi_select' | 'short_answer'; prompt: string; points: number; options?: { text: string; isCorrect: boolean }[] }[];
    };
    for (const q of payload.questions) {
      if (!['mcq', 'multi_select', 'short_answer'].includes(q.type)) {
        next(badRequest(`Unsupported question type ${q.type}`));
        return;
      }
      if ((q.type === 'mcq' || q.type === 'multi_select') && (!q.options || q.options.length < 2 || !q.options.some((o) => o.isCorrect))) {
        next(badRequest('Objective draft questions need at least 2 options with one correct answer'));
        return;
      }
    }
    const quizId = newId();
    await db.query(`INSERT INTO quizzes (id, course_id, instructor_id, title, description, is_ai_generated) VALUES ($1, $2, $3, $4, '', true)`, [
      quizId,
      draft.course_id,
      req.user!.id,
      `AI draft for lecture ${draft.lecture_id ?? 'module'}`,
    ]);
    for (const q of payload.questions) {
      const questionId = newId();
      await db.query(`INSERT INTO quiz_questions (id, quiz_id, type, prompt, points) VALUES ($1, $2, $3, $4, $5)`, [
        questionId,
        quizId,
        q.type,
        q.prompt,
        q.points ?? 1,
      ]);
      let order = 0;
      for (const o of q.options ?? []) {
        await db.query(`INSERT INTO quiz_options (id, question_id, option_text, is_correct, sort_order) VALUES ($1, $2, $3, $4, $5)`, [
          newId(),
          questionId,
          o.text,
          o.isCorrect,
          order++,
        ]);
      }
    }
    await db.query(`UPDATE ai_quiz_drafts SET status = 'approved', approved_quiz_id = $1, reviewed_by = $2, reviewed_at = now(), updated_at = now() WHERE id = $3`, [
      quizId,
      req.user!.id,
      draft.id,
    ]);
    res.json({ draftId: draft.id, status: 'approved', quizId });
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/ai/quiz-drafts/:id/reject', authenticate, authorize('instructor', 'admin'), async (req, res, next) => {
  try {
    const draftRes = await db.query(`SELECT id, course_id, status FROM ai_quiz_drafts WHERE id = $1`, [req.params.id]);
    const draft = draftRes.rows[0] as { id: string; course_id: string; status: string } | undefined;
    if (!draft) {
      next(notFound('Quiz draft not found'));
      return;
    }
    if (draft.status !== 'pending_review') {
      next(conflict('Draft is not pending review'));
      return;
    }
    const courseRes = await db.query(`SELECT instructor_id FROM courses WHERE id = $1`, [draft.course_id]);
    const instructorId = (courseRes.rows[0] as { instructor_id: string } | undefined)?.instructor_id;
    if (!req.user!.roles.includes('admin') && instructorId !== req.user!.id) {
      next(forbidden('You do not own this course'));
      return;
    }
    await db.query(`UPDATE ai_quiz_drafts SET status = 'rejected', reviewed_by = $1, reviewed_at = now(), updated_at = now() WHERE id = $2`, [req.user!.id, draft.id]);
    res.json({ draftId: draft.id, status: 'rejected' });
  } catch (err) {
    next(err);
  }
});

aiRouter.get('/ai/quiz-drafts', authenticate, authorize('instructor', 'admin'), async (req, res, next) => {
  try {
    const courseId = req.query.courseId as string | undefined;
    if (courseId) {
      const courseRes = await db.query(`SELECT instructor_id FROM courses WHERE id = $1`, [courseId]);
      const instructorId = (courseRes.rows[0] as { instructor_id: string } | undefined)?.instructor_id;
      if (!courseRes.rowCount) {
        next(notFound('Course not found'));
        return;
      }
      if (!req.user!.roles.includes('admin') && instructorId !== req.user!.id) {
        next(forbidden('You do not own this course'));
        return;
      }
      const rows = await db.query(`SELECT id, course_id, lecture_id, status, payload, approved_quiz_id, created_at FROM ai_quiz_drafts WHERE course_id = $1 ORDER BY created_at DESC`, [
        courseId,
      ]);
      res.json({ data: rows.rows });
      return;
    }
    const rows = await db.query(`SELECT id, course_id, lecture_id, status, payload, approved_quiz_id, created_at FROM ai_quiz_drafts ORDER BY created_at DESC LIMIT 50`);
    const filtered: Record<string, unknown>[] = [];
    for (const r of rows.rows as { course_id: string }[] & Record<string, unknown>[]) {
      const courseRes = await db.query(`SELECT instructor_id FROM courses WHERE id = $1`, [r.course_id]);
      const instructorId = (courseRes.rows[0] as { instructor_id: string } | undefined)?.instructor_id;
      if (req.user!.roles.includes('admin') || instructorId === req.user!.id) filtered.push(r as Record<string, unknown>);
    }
    res.json({ data: filtered });
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/ai/modules/:id/flashcards', authenticate, async (req, res, next) => {
  try {
    const moduleRes = await db.query(`SELECT id, course_id FROM modules WHERE id = $1`, [req.params.id]);
    const mod = moduleRes.rows[0] as { id: string; course_id: string } | undefined;
    if (!mod) {
      next(notFound('Module not found'));
      return;
    }
    const access = await requireCourseAccessOr404(mod.course_id, { id: req.user!.id, roles: req.user!.roles });
    if (!access) {
      next(forbidden('Enrollment required'));
      return;
    }
    const lectureRes = await db.query(`SELECT id FROM lectures WHERE module_id = $1 ORDER BY sort_order LIMIT 5`, [mod.id]);
    const lectureIds = (lectureRes.rows as { id: string }[]).map((r) => r.id);
    let cards: { front: string; back: string }[] | null = null;
    if (isAiServiceConfigured() && !isAiServiceBreakerOpen()) {
      try {
        const remote = await callAiServiceGenerate<{ flashcards: { front: string; back: string }[] }>(`/v1/flashcards`, {
          module_id: mod.id,
          lecture_ids: lectureIds,
        });
        cards = Array.isArray(remote.flashcards) && remote.flashcards.length ? remote.flashcards : null;
      } catch (err) {
        // Fall through to the local card builder.
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'ai-service flashcards failed — using local builder');
      }
    }
    if (!cards && lectureIds.length) {
      const placeholders = lectureIds.map((id) => `lecture ${id}`);
      void placeholders;
      const chunkRows = await db.query(`SELECT chunk_text, lecture_id FROM document_chunks WHERE course_id = $1 LIMIT 10`, [mod.course_id]);
      const texts = (chunkRows.rows as { chunk_text: string }[]).map((r) => r.chunk_text);
      cards = texts.slice(0, 8).map((t, i) => ({
        front: `Key concept ${i + 1}: what does this mean? ${t.slice(0, 120)}`,
        back: t.slice(0, 400),
      }));
      if (!cards.length) {
        cards = [{ front: `What is the main idea of module ${mod.id}?`, back: 'Review the indexed lecture transcripts for this module.' }];
      }
    } else if (!cards) {
      cards = [{ front: `What is the main idea of module ${mod.id}?`, back: 'Add lectures and transcripts first.' }];
    }
    const created: Record<string, unknown>[] = [];
    for (const c of cards.slice(0, 20)) {
      const id = newId();
      await db.query(`INSERT INTO flashcards (id, user_id, course_id, module_id, front, back) VALUES ($1, $2, $3, $4, $5, $6)`, [
        id,
        req.user!.id,
        mod.course_id,
        mod.id,
        c.front.slice(0, 2000),
        c.back.slice(0, 4000),
      ]);
      created.push({ id, front: c.front, back: c.back });
    }
    res.status(201).json({ moduleId: mod.id, flashcards: created });
  } catch (err) {
    next(err);
  }
});

aiRouter.post('/ai/study-plan', authenticate, authorize('student', 'admin'), validateBody(studyPlanSchema), async (req, res, next) => {
  try {
    const body = req.body as { courseId: string };
    const access = await requireCourseAccessOr404(body.courseId, { id: req.user!.id, roles: req.user!.roles });
    if (!access) {
      const exists = await db.query(`SELECT id FROM courses WHERE id = $1`, [body.courseId]);
      if (!exists.rowCount) {
        next(notFound('Course not found'));
        return;
      }
      next(forbidden('Enrollment required'));
      return;
    }
    const ratio = await quizScoreRatio(req.user!.id, body.courseId);
    const mastery = await courseMastery(req.user!.id, body.courseId);
    const weakRes = await db.query(
      `SELECT q.title, a.score, a.max_score FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.student_id = $1 AND q.course_id = $2 AND a.status IN ('submitted', 'graded') LIMIT 50`,
      [req.user!.id, body.courseId],
    );
    const weakTopics: string[] = [];
    {
      const byTitle = new Map<string, { earned: number; max: number }>();
      for (const w of weakRes.rows as { title: string; score: number | null; max_score: number | null }[]) {
        const entry = byTitle.get(w.title) ?? { earned: 0, max: 0 };
        entry.earned += w.score ?? 0;
        entry.max += w.max_score ?? 0;
        byTitle.set(w.title, entry);
      }
      for (const [title, totals] of byTitle) {
        if (totals.max > 0 && totals.earned / totals.max < 0.7 && weakTopics.length < 5) weakTopics.push(title);
      }
    }
    let plan: Record<string, unknown> | null = null;
    if (isAiServiceConfigured() && !isAiServiceBreakerOpen()) {
      try {
        plan = await callAiServiceGenerate<Record<string, unknown>>(`/v1/study-plan`, {
          course_id: body.courseId,
          quiz_ratio: ratio,
          weak_topics: weakTopics,
          mastery: mastery.level,
        });
      } catch (err) {
        // Fall through to the local plan builder.
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'ai-service study plan failed — using local builder');
      }
    }
    if (!plan) {
      const focus = weakTopics.length ? weakTopics : ['core concepts'];
      plan = {
        courseId: body.courseId,
        mastery: mastery.level,
        quizRatio: ratio,
        explanationDepth: mastery.level === 'beginner' ? 'foundations first' : mastery.level,
        weeks: [1, 2, 3].map((week) => ({
          week,
          focus: focus[week % focus.length],
          tasks: [`Revisit ${focus[week % focus.length]}`, 'Attempt one practice quiz', 'Ask the AI tutor one grounded question'],
          targetMinutes: mastery.level === 'beginner' ? 150 : 120,
        })),
        generatedAt: new Date().toISOString(),
      };
    }
    await db.query(
      `INSERT INTO study_plans (id, user_id, course_id, plan) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, course_id) DO UPDATE SET plan = EXCLUDED.plan, updated_at = now()`,
      [newId(), req.user!.id, body.courseId, JSON.stringify(plan)],
    );
    const saved = await db.query(`SELECT id, user_id, course_id, plan, updated_at FROM study_plans WHERE user_id = $1 AND course_id = $2`, [req.user!.id, body.courseId]);
    const row = saved.rows[0] as { plan: string } & Record<string, unknown>;
    res.status(201).json({ ...(row as object), plan: JSON.parse(row.plan as string) });
  } catch (err) {
    next(err);
  }
});

aiRouter.get('/ai/mastery/:courseId', authenticate, async (req, res, next) => {
  try {
    const access = await requireCourseAccessOr404(req.params.courseId, { id: req.user!.id, roles: req.user!.roles });
    if (!access) {
      next(forbidden('Enrollment required'));
      return;
    }
    const mastery = await courseMastery(req.user!.id, req.params.courseId);
    res.json({ ...mastery, formula: 'advanced if quizRatio>=0.85; intermediate if >=0.60; else beginner; no-history falls back to enrollment progress' });
  } catch (err) {
    next(err);
  }
});

aiRouter.get('/recommendations/me', authenticate, async (req, res, next) => {
  try {
    await refreshRecommendationsForUser(req.user!.id);
    const rows = await db.query(
      `SELECT id, course_id, kind, title, reason, score, created_at FROM recommendations WHERE user_id = $1 ORDER BY score DESC, created_at DESC`,
      [req.user!.id],
    );
    res.json({ data: rows.rows });
  } catch (err) {
    next(err);
  }
});

aiRouter.get('/courses/:id/ai-status', authenticate, authorize('instructor', 'admin'), requireCourseOwner, async (req, res, next) => {
  try {
    const chunks = await db.query(`SELECT COUNT(*)::int AS count FROM document_chunks WHERE course_id = $1`, [req.params.id]);
    const drafts = await db.query(`SELECT status, COUNT(*)::int AS count FROM ai_quiz_drafts WHERE course_id = $1 GROUP BY status`, [req.params.id]);
    const provider = getEmbeddingProvider();
    void parseEmbedding;
    void serializeEmbedding;
    // Live, bounded probe of the backend→AI-service hop (8s max). When this is
    // false the Tutor is answering from the local grounded path, which is
    // exactly the signal that was missing during the hosted "Waking AI
    // Tutor…" debugging. Names/hosts only — never a token or key.
    const aiServiceReachable = isAiServiceConfigured() ? await pingAiService(8000) : false;
    res.json({
      courseId: req.params.id,
      chunks: (chunks.rows[0] as { count: number }).count,
      drafts: drafts.rows,
      embeddingDim: provider.dim,
      aiServiceConfigured: isAiServiceConfigured(),
      aiServiceHost: aiServiceHost(),
      aiServiceReachable,
      aiService: aiServiceDiagnostics(),
      chatProvider: getLlmProviderName(),
      chatProviderChain: getProviderChain().map((p) => p.name),
      masteryHint: masteryLevelFromRatio(null),
    });
  } catch (err) {
    next(err);
  }
});
