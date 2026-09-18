import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../auth/middleware';
import { db, newId } from '../db/pool';
import { forbidden, notFound } from '../errors';
import { validateBody } from '../middleware/validate';
import { isEnrolled } from '../learning/guards';
import { requireCourseOwner, requireModuleOwner } from './ownership';
import { CACHE_TTL, cacheGet, cacheInvalidate, cacheSet, catalogCacheKey, courseMetaCacheKey } from '../cache/courseCache';

const courseSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().max(5000).default(''),
  category: z.string().max(120).default(''),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
});

const moduleSchema = z.object({
  title: z.string().min(1).max(255),
  sortOrder: z.number().int().min(0).default(0),
});

const lectureSchema = z.object({
  title: z.string().min(1).max(255),
  sortOrder: z.number().int().min(0).default(0),
  videoKey: z.string().max(1024).optional(),
  durationS: z.number().int().min(0).optional(),
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(255).optional(),
  status: z.enum(['draft', 'pending', 'published', 'rejected']).optional(),
  category: z.string().max(120).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
});

const courseMetaSchema = z.object({
  category: z.string().max(120).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

/** Rating aggregates as a portable LEFT JOIN (works on Postgres and pg-mem). */
const RATING_JOIN = `LEFT JOIN (
  SELECT course_id, AVG(rating)::float AS avg_rating, COUNT(*)::int AS rating_count
  FROM course_reviews GROUP BY course_id
) r ON r.course_id = c.id`;

export const coursesRouter = Router();

coursesRouter.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, q, status, category, difficulty, minRating } = listQuery.parse(req.query);
    const cacheKey = catalogCacheKey({ page, pageSize, q, status, category, difficulty, minRating });
    const cached = await cacheGet<{ data: unknown[]; page: number; pageSize: number; total: number }>(cacheKey);
    if (cached.hit && cached.value) {
      res.setHeader('x-cache', 'HIT');
      res.json(cached.value);
      return;
    }
    const baseWhere: string[] = [];
    const baseParams: unknown[] = [];
    if (status) {
      baseParams.push(status);
      baseWhere.push(`c.status = $${baseParams.length}`);
    }
    if (q) {
      baseParams.push(`%${q}%`);
      baseWhere.push(`(c.title ILIKE $${baseParams.length} OR c.description ILIKE $${baseParams.length})`);
    }
    // Migration 005 (category/difficulty/reviews) degrades gracefully when absent.
    let metaAvailable = true;
    try {
      await db.query(`SELECT c.category, c.difficulty FROM courses c LIMIT 0`);
    } catch {
      metaAvailable = false;
    }
    let ratingAvailable = false;
    if (metaAvailable) {
      try {
        await db.query(`SELECT course_id FROM course_reviews LIMIT 0`);
        ratingAvailable = true;
      } catch {
        ratingAvailable = false;
      }
    }
    const where = [...baseWhere];
    const params = [...baseParams];
    let ratingJoin = '';
    if (metaAvailable) {
      if (category) {
        params.push(category);
        where.push(`c.category = $${params.length}`);
      }
      if (difficulty) {
        params.push(difficulty);
        where.push(`c.difficulty = $${params.length}`);
      }
      if (ratingAvailable) {
        ratingJoin = RATING_JOIN;
        if (minRating !== undefined && minRating > 0) {
          params.push(minRating);
          where.push(`COALESCE(r.avg_rating, 0) >= $${params.length}`);
        }
      }
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await db.query(`SELECT COUNT(*)::int AS count FROM courses c ${ratingJoin} ${clause}`, params);
    let rows;
    if (metaAvailable) {
      try {
        rows = await db.query(
          `SELECT c.id, c.title, c.description, c.status, c.instructor_id, c.category, c.difficulty,
                  COALESCE(r.avg_rating, 0)::float AS avg_rating, COALESCE(r.rating_count, 0)::int AS rating_count,
                  c.created_at, c.updated_at
           FROM courses c ${ratingJoin} ${clause} ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, pageSize, (page - 1) * pageSize],
        );
      } catch {
        rows = undefined;
      }
    }
    if (!rows) {
      const legacyClause = baseWhere.length ? `WHERE ${baseWhere.join(' AND ')}` : '';
      const legacyTotal = await db.query(`SELECT COUNT(*)::int AS count FROM courses c ${legacyClause}`, baseParams);
      const legacy = await db.query(
        `SELECT c.id, c.title, c.description, c.status, c.instructor_id, c.created_at, c.updated_at
         FROM courses c ${legacyClause} ORDER BY c.created_at DESC LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}`,
        [...baseParams, pageSize, (page - 1) * pageSize],
      );
      const body = { data: legacy.rows, page, pageSize, total: (legacyTotal.rows[0] as { count: number }).count };
      await cacheSet(cacheKey, body, CACHE_TTL.catalog);
      res.setHeader('x-cache', 'MISS');
      res.json(body);
      return;
    }
    const body = { data: rows.rows, page, pageSize, total: (total.rows[0] as { count: number }).count };
    await cacheSet(cacheKey, body, CACHE_TTL.catalog);
    res.setHeader('x-cache', 'MISS');
    res.json(body);
  } catch (err) {
    next(err);
  }
});

coursesRouter.get('/:id', async (req, res, next) => {
  try {
    const metaKey = courseMetaCacheKey(req.params.id);
    // Course detail includes module/lecture structure (public metadata only).
    // Per-user enrollment state is never cached — only the shared metadata.
    const cached = await cacheGet<Record<string, unknown>>(metaKey);
    if (cached.hit && cached.value) {
      res.setHeader('x-cache', 'HIT');
      res.json(cached.value);
      return;
    }
    let course: Record<string, unknown> | undefined;
    try {
      const withMeta = await db.query(
        `SELECT c.id, c.title, c.description, c.status, c.instructor_id, c.category, c.difficulty,
                COALESCE(r.avg_rating, 0)::float AS avg_rating, COALESCE(r.rating_count, 0)::int AS rating_count,
                c.created_at, c.updated_at
         FROM courses c ${RATING_JOIN} WHERE c.id = $1`,
        [req.params.id],
      );
      course = withMeta.rows[0] as Record<string, unknown> | undefined;
    } catch {
      const legacy = await db.query(
        `SELECT c.id, c.title, c.description, c.status, c.instructor_id, c.created_at, c.updated_at
         FROM courses c WHERE c.id = $1`,
        [req.params.id],
      );
      course = legacy.rows[0] as Record<string, unknown> | undefined;
    }
    const row = course;
    if (!row) {
      next(notFound('Course not found'));
      return;
    }
    const modulesRes = await db.query(
      `SELECT id, course_id, title, sort_order, created_at FROM modules WHERE course_id = $1 ORDER BY sort_order`,
      [req.params.id],
    );
    const lecturesRes = modulesRes.rows.length
      ? await db.query(
          `SELECT l.id, l.module_id, l.title, l.sort_order FROM lectures l
           JOIN modules m ON m.id = l.module_id WHERE m.course_id = $1 ORDER BY l.sort_order`,
          [req.params.id],
        )
      : { rows: [] as Record<string, unknown>[] };
    const byModule = new Map<string, Record<string, unknown>[]>();
    for (const lecture of lecturesRes.rows as { id: string; module_id: string; title: string; sort_order: number }[]) {
      const list = byModule.get(lecture.module_id) ?? [];
      list.push({ id: lecture.id, title: lecture.title, sortOrder: lecture.sort_order });
      byModule.set(lecture.module_id, list);
    }
    const modules = (modulesRes.rows as { id: string; title: string; sort_order: number; created_at: unknown }[]).map(
      (m) => ({ id: m.id, title: m.title, sort_order: m.sort_order, created_at: m.created_at, lectures: byModule.get(m.id) ?? [] }),
    );
    const body = { ...(row as object), modules };
    await cacheSet(metaKey, body, CACHE_TTL.courseMeta);
    res.setHeader('x-cache', 'MISS');
    res.json(body);
  } catch (err) {
    next(err);
  }
});

coursesRouter.post('/', authenticate, authorize('instructor', 'admin'), validateBody(courseSchema), async (req, res, next) => {
  try {
    const id = newId();
    const body = req.body as { title: string; description: string; category: string; difficulty: string };
    try {
      await db.query(
        `INSERT INTO courses (id, instructor_id, title, description, status, category, difficulty) VALUES ($1, $2, $3, $4, 'pending', $5, $6)`,
        [id, req.user!.id, body.title, body.description ?? '', body.category ?? '', body.difficulty ?? 'beginner'],
      );
    } catch {
      // Migration 005 not applied: fall back to the legacy column set.
      await db.query(
        `INSERT INTO courses (id, instructor_id, title, description, status) VALUES ($1, $2, $3, $4, 'pending')`,
        [id, req.user!.id, body.title, body.description ?? ''],
      );
    }
    // Record the pending approval request (best-effort: table exists after migration 004).
    try {
      await db.query(
        `INSERT INTO course_approvals (id, course_id, requested_by, decision) VALUES ($1, $2, $3, 'pending')`,
        [newId(), id, req.user!.id],
      );
    } catch {
      // Approval history unavailable — course status remains the source of truth.
    }
    const created = await db.query(`SELECT id, title, description, status, instructor_id, created_at, updated_at FROM courses WHERE id = $1`, [id]);
    await cacheInvalidate('vl:catalog');
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

coursesRouter.put(
  '/:id',
  authenticate,
  authorize('instructor', 'admin'),
  requireCourseOwner,
  validateBody(courseSchema.partial()),
  async (req, res, next) => {
    try {
      const existing = await db.query(`SELECT id FROM courses WHERE id = $1`, [req.params.id]);
      if (!existing.rowCount) {
        next(notFound('Course not found'));
        return;
      }
      const patch = req.body as Partial<{ title: string; description: string; category: string; difficulty: string }>;
      try {
        await db.query(
          `UPDATE courses SET title = COALESCE($2, title), description = COALESCE($3, description), category = COALESCE($4, category), difficulty = COALESCE($5, difficulty), updated_at = now() WHERE id = $1`,
          [req.params.id, patch.title ?? null, patch.description ?? null, patch.category ?? null, patch.difficulty ?? null],
        );
      } catch {
        await db.query(
          `UPDATE courses SET title = COALESCE($2, title), description = COALESCE($3, description), updated_at = now() WHERE id = $1`,
          [req.params.id, patch.title ?? null, patch.description ?? null],
        );
      }
      const updated = await db.query(
        `SELECT id, title, description, status, instructor_id, created_at, updated_at FROM courses WHERE id = $1`,
        [req.params.id],
      );
      await cacheInvalidate('vl:catalog');
      await cacheInvalidate(courseMetaCacheKey(req.params.id));
      res.json(updated.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

coursesRouter.post(
  '/:id/modules',
  authenticate,
  authorize('instructor', 'admin'),
  requireCourseOwner,
  validateBody(moduleSchema),
  async (req, res, next) => {
    try {
      const id = newId();
      await db.query(`INSERT INTO modules (id, course_id, title, sort_order) VALUES ($1, $2, $3, $4)`, [
        id,
        req.params.id,
        req.body.title,
        req.body.sortOrder ?? 0,
      ]);
      const created = await db.query(`SELECT id, course_id, title, sort_order, created_at FROM modules WHERE id = $1`, [id]);
      res.status(201).json(created.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

coursesRouter.post(
  '/modules/:id/lectures',
  authenticate,
  authorize('instructor', 'admin'),
  requireModuleOwner,
  validateBody(lectureSchema),
  async (req, res, next) => {
    try {
      const id = newId();
      await db.query(
        `INSERT INTO lectures (id, module_id, title, sort_order, video_key, duration_s) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, req.params.id, req.body.title, req.body.sortOrder ?? 0, req.body.videoKey ?? null, req.body.durationS ?? null],
      );
      const created = await db.query(
        `SELECT id, module_id, title, sort_order, video_key, duration_s, created_at FROM lectures WHERE id = $1`,
        [id],
      );
      res.status(201).json(created.rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().max(5000).default(''),
});

/** Public review list (names + ratings only — real data, never fabricated). */
coursesRouter.get('/:id/reviews', async (req, res, next) => {
  try {
    const course = await db.query(`SELECT id FROM courses WHERE id = $1`, [req.params.id]);
    if (!course.rowCount) {
      next(notFound('Course not found'));
      return;
    }
    try {
      const rows = await db.query(
        `SELECT r.id, r.course_id, r.rating, r.review, r.created_at, u.name AS reviewer_name
         FROM course_reviews r JOIN users u ON u.id = r.user_id WHERE r.course_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
        [req.params.id],
      );
      const agg = await db.query(
        `SELECT COALESCE(AVG(rating), 0)::float AS avg_rating, COUNT(*)::int AS rating_count FROM course_reviews WHERE course_id = $1`,
        [req.params.id],
      );
      res.json({ data: rows.rows, aggregate: agg.rows[0] });
    } catch {
      res.json({ data: [], aggregate: { avg_rating: 0, rating_count: 0 }, unavailable: 'course_reviews table missing: apply migration 005' });
    }
  } catch (err) {
    next(err);
  }
});

/** Submit/update my review (enrolled students and admins; one per student per course). */
coursesRouter.post('/:id/reviews', authenticate, validateBody(reviewSchema), async (req, res, next) => {
  try {
    const course = await db.query(`SELECT id, instructor_id FROM courses WHERE id = $1`, [req.params.id]);
    const row = course.rows[0] as { id: string; instructor_id: string } | undefined;
    if (!row) {
      next(notFound('Course not found'));
      return;
    }
    const user = req.user!;
    if (!user.roles.includes('admin') && row.instructor_id !== user.id && !(await isEnrolled(user.id, row.id))) {
      next(forbidden('Enrollment required to review this course'));
      return;
    }
    const body = req.body as z.infer<typeof reviewSchema>;
    const id = newId();
    try {
      await db.query(
        `INSERT INTO course_reviews (id, course_id, user_id, rating, review) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, course_id) DO UPDATE SET rating = EXCLUDED.rating, review = EXCLUDED.review, updated_at = now()`,
        [id, row.id, user.id, body.rating, body.review ?? ''],
      );
    } catch {
      next(notFound('Reviews are unavailable: apply migration 005'));
      return;
    }
    const saved = await db.query(
      `SELECT id, course_id, user_id, rating, review, created_at FROM course_reviews WHERE course_id = $1 AND user_id = $2`,
      [row.id, user.id],
    );
    await cacheInvalidate('vl:catalog');
    await cacheInvalidate(courseMetaCacheKey(row.id));
    res.status(201).json(saved.rows[0]);
  } catch (err) {
    next(err);
  }
});
