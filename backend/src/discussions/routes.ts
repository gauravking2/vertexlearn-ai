import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import { db, newId } from '../db/pool';
import { forbidden, notFound } from '../errors';
import { validateBody } from '../middleware/validate';
import { isEnrolled } from '../learning/guards';

export const discussionsRouter = Router();

// NOTE: authenticate is applied per-route (not via router.use) because this
// router is mounted at the shared /api/v1 prefix.

async function courseAccess(courseId: string, user: { id: string; roles: string[] }): Promise<{ ok: boolean; isOwner: boolean; isAdmin: boolean; status?: string }> {
  const res = await db.query(`SELECT id, instructor_id, status FROM courses WHERE id = $1`, [courseId]);
  const course = res.rows[0] as { id: string; instructor_id: string; status: string } | undefined;
  if (!course) return { ok: false, isOwner: false, isAdmin: false };
  const isAdmin = user.roles.includes('admin');
  const isOwner = course.instructor_id === user.id;
  if (isAdmin || isOwner) return { ok: true, isOwner, isAdmin, status: course.status };
  const enrolled = await isEnrolled(user.id, courseId);
  return { ok: enrolled, isOwner: false, isAdmin: false, status: course.status };
}

async function threadCourse(threadId: string): Promise<{ courseId: string; instructorId: string } | undefined> {
  const res = await db.query(
    `SELECT t.course_id AS course_id, c.instructor_id AS instructor_id FROM discussion_threads t JOIN courses c ON c.id = t.course_id WHERE t.id = $1`,
    [threadId],
  );
  const row = res.rows[0] as { course_id: string; instructor_id: string } | undefined;
  if (!row) return undefined;
  return { courseId: row.course_id, instructorId: row.instructor_id };
}

const threadSchema = z.object({
  title: z.string().min(3).max(255),
  body: z.string().min(1).max(10000),
});

const postSchema = z.object({
  body: z.string().min(1).max(10000),
  parentPostId: z.string().uuid().optional(),
});

const flagSchema = z.object({
  reason: z.string().max(2000).default(''),
});

// List threads for a course (enrolled students, owner instructor, admin).
discussionsRouter.get('/courses/:courseId/discussions/threads', authenticate, async (req, res, next) => {
  try {
    const access = await courseAccess(req.params.courseId, { id: req.user!.id, roles: req.user!.roles });
    if (!access.ok) {
      const exists = await db.query(`SELECT id FROM courses WHERE id = $1`, [req.params.courseId]);
      if (!exists.rowCount) {
        next(notFound('Course not found'));
        return;
      }
      next(forbidden('Enrollment required'));
      return;
    }
    const rows = await db.query(
      `SELECT t.id, t.course_id, t.author_id, t.title, t.is_hidden, t.created_at, t.updated_at, u.name AS author_name,
              (SELECT COUNT(*)::int FROM discussion_posts p WHERE p.thread_id = t.id) AS post_count
       FROM discussion_threads t JOIN users u ON u.id = t.author_id
       WHERE t.course_id = $1 ${access.isAdmin || access.isOwner ? '' : 'AND t.is_hidden = false'}
       ORDER BY t.created_at DESC`,
      [req.params.courseId],
    );
    res.json({ data: rows.rows });
  } catch (err) {
    next(err);
  }
});

discussionsRouter.post('/courses/:courseId/discussions/threads', validateBody(threadSchema), authenticate, async (req, res, next) => {
  try {
    const access = await courseAccess(req.params.courseId, { id: req.user!.id, roles: req.user!.roles });
    if (!access.ok) {
      const exists = await db.query(`SELECT id FROM courses WHERE id = $1`, [req.params.courseId]);
      if (!exists.rowCount) {
        next(notFound('Course not found'));
        return;
      }
      next(forbidden('Enrollment required'));
      return;
    }
    const body = req.body as z.infer<typeof threadSchema>;
    const threadId = newId();
    await db.query(`INSERT INTO discussion_threads (id, course_id, author_id, title) VALUES ($1, $2, $3, $4)`, [
      threadId,
      req.params.courseId,
      req.user!.id,
      body.title,
    ]);
    const postId = newId();
    await db.query(`INSERT INTO discussion_posts (id, thread_id, author_id, body) VALUES ($1, $2, $3, $4)`, [
      postId,
      threadId,
      req.user!.id,
      body.body,
    ]);
    const created = await db.query(`SELECT id, course_id, author_id, title, is_hidden, created_at FROM discussion_threads WHERE id = $1`, [threadId]);
    res.status(201).json({ ...(created.rows[0] as object), firstPostId: postId });
  } catch (err) {
    next(err);
  }
});

// Thread view with posts (course isolation enforced via thread -> course).
discussionsRouter.get('/discussions/threads/:threadId', authenticate, async (req, res, next) => {
  try {
    const ref = await threadCourse(req.params.threadId);
    if (!ref) {
      next(notFound('Thread not found'));
      return;
    }
    const access = await courseAccess(ref.courseId, { id: req.user!.id, roles: req.user!.roles });
    if (!access.ok) {
      next(forbidden('Enrollment required'));
      return;
    }
    const thread = await db.query(
      `SELECT t.id, t.course_id, t.author_id, t.title, t.is_hidden, t.created_at, u.name AS author_name FROM discussion_threads t JOIN users u ON u.id = t.author_id WHERE t.id = $1`,
      [req.params.threadId],
    );
    if (!thread.rowCount) {
      next(notFound('Thread not found'));
      return;
    }
    const canSeeHidden = access.isAdmin || access.isOwner;
    const posts = await db.query(
      `SELECT p.id, p.thread_id, p.author_id, p.body, p.parent_post_id, p.is_hidden, p.flag_count, p.created_at, u.name AS author_name
       FROM discussion_posts p JOIN users u ON u.id = p.author_id
       WHERE p.thread_id = $1 ${canSeeHidden ? '' : 'AND p.is_hidden = false'} ORDER BY p.created_at`,
      [req.params.threadId],
    );
    res.json({ thread: thread.rows[0], posts: posts.rows });
  } catch (err) {
    next(err);
  }
});

discussionsRouter.post('/discussions/threads/:threadId/posts', validateBody(postSchema), authenticate, async (req, res, next) => {
  try {
    const ref = await threadCourse(req.params.threadId);
    if (!ref) {
      next(notFound('Thread not found'));
      return;
    }
    const access = await courseAccess(ref.courseId, { id: req.user!.id, roles: req.user!.roles });
    if (!access.ok) {
      next(forbidden('Enrollment required'));
      return;
    }
    const body = req.body as z.infer<typeof postSchema>;
    if (body.parentPostId) {
      const parent = await db.query(`SELECT id FROM discussion_posts WHERE id = $1 AND thread_id = $2`, [body.parentPostId, req.params.threadId]);
      if (!parent.rowCount) {
        next(notFound('Parent post not found in this thread'));
        return;
      }
    }
    const id = newId();
    await db.query(`INSERT INTO discussion_posts (id, thread_id, author_id, body, parent_post_id) VALUES ($1, $2, $3, $4, $5)`, [
      id,
      req.params.threadId,
      req.user!.id,
      body.body,
      body.parentPostId ?? null,
    ]);
    const created = await db.query(`SELECT id, thread_id, author_id, body, parent_post_id, created_at FROM discussion_posts WHERE id = $1`, [id]);
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Edit own post (IDOR: only author or admin).
discussionsRouter.put('/discussions/posts/:postId', validateBody(postSchema.pick({ body: true })), authenticate, async (req, res, next) => {
  try {
    const post = await db.query(`SELECT id, author_id FROM discussion_posts WHERE id = $1`, [req.params.postId]);
    const row = post.rows[0] as { id: string; author_id: string } | undefined;
    if (!row) {
      next(notFound('Post not found'));
      return;
    }
    if (row.author_id !== req.user!.id && !req.user!.roles.includes('admin')) {
      next(forbidden('You do not own this post'));
      return;
    }
    await db.query(`UPDATE discussion_posts SET body = $1, updated_at = now() WHERE id = $2`, [(req.body as { body: string }).body, req.params.postId]);
    const updated = await db.query(`SELECT id, thread_id, author_id, body, updated_at FROM discussion_posts WHERE id = $1`, [req.params.postId]);
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Delete post: author, course-owner instructor, or admin.
discussionsRouter.delete('/discussions/posts/:postId', authenticate, async (req, res, next) => {
  try {
    const post = await db.query(
      `SELECT p.id, p.author_id, t.course_id, c.instructor_id FROM discussion_posts p JOIN discussion_threads t ON t.id = p.thread_id JOIN courses c ON c.id = t.course_id WHERE p.id = $1`,
      [req.params.postId],
    );
    const row = post.rows[0] as { id: string; author_id: string; course_id: string; instructor_id: string } | undefined;
    if (!row) {
      next(notFound('Post not found'));
      return;
    }
    const user = req.user!;
    const allowed = row.author_id === user.id || user.roles.includes('admin') || row.instructor_id === user.id;
    if (!allowed) {
      next(forbidden('Not authorized to delete this post'));
      return;
    }
    await db.query(`DELETE FROM discussion_posts WHERE id = $1`, [req.params.postId]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Flag / report a post (any enrolled participant; one flag per reporter).
discussionsRouter.post('/discussions/posts/:postId/flag', validateBody(flagSchema), authenticate, async (req, res, next) => {
  try {
    const post = await db.query(
      `SELECT p.id, t.course_id FROM discussion_posts p JOIN discussion_threads t ON t.id = p.thread_id WHERE p.id = $1`,
      [req.params.postId],
    );
    const row = post.rows[0] as { id: string; course_id: string } | undefined;
    if (!row) {
      next(notFound('Post not found'));
      return;
    }
    const access = await courseAccess(row.course_id, { id: req.user!.id, roles: req.user!.roles });
    if (!access.ok) {
      next(forbidden('Enrollment required'));
      return;
    }
    const id = newId();
    const reason = (req.body as { reason: string }).reason ?? '';
    try {
      await db.query(`INSERT INTO discussion_flags (id, post_id, reporter_id, reason) VALUES ($1, $2, $3, $4)`, [id, req.params.postId, req.user!.id, reason]);
    } catch {
      next(forbidden('You have already flagged this post'));
      return;
    }
    await db.query(`UPDATE discussion_posts SET flag_count = flag_count + 1 WHERE id = $1`, [req.params.postId]);
    res.status(201).json({ id, postId: req.params.postId, status: 'open' });
  } catch (err) {
    next(err);
  }
});

// Instructor moderation within own course: hide/unhide a post.
const moderateSchema = z.object({ action: z.enum(['hide', 'unhide', 'delete']) });

discussionsRouter.put('/discussions/posts/:postId/moderate', validateBody(moderateSchema), authenticate, async (req, res, next) => {
  try {
    const post = await db.query(
      `SELECT p.id, t.course_id, c.instructor_id FROM discussion_posts p JOIN discussion_threads t ON t.id = p.thread_id JOIN courses c ON c.id = t.course_id WHERE p.id = $1`,
      [req.params.postId],
    );
    const row = post.rows[0] as { id: string; course_id: string; instructor_id: string } | undefined;
    if (!row) {
      next(notFound('Post not found'));
      return;
    }
    const user = req.user!;
    const allowed = user.roles.includes('admin') || row.instructor_id === user.id;
    if (!allowed) {
      next(forbidden('Only the course instructor or an admin can moderate'));
      return;
    }
    const { action } = req.body as z.infer<typeof moderateSchema>;
    if (action === 'delete') {
      await db.query(`DELETE FROM discussion_posts WHERE id = $1`, [req.params.postId]);
      res.status(204).send();
      return;
    }
    await db.query(`UPDATE discussion_posts SET is_hidden = $1 WHERE id = $2`, [action === 'hide', req.params.postId]);
    const updated = await db.query(`SELECT id, thread_id, is_hidden, flag_count FROM discussion_posts WHERE id = $1`, [req.params.postId]);
    res.json({ ...(updated.rows[0] as object), action });
  } catch (err) {
    next(err);
  }
});
