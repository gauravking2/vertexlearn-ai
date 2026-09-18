import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../auth/middleware';
import { db, newId } from '../db/pool';
import { conflict, forbidden, notFound } from '../errors';
import { validateBody } from '../middleware/validate';
import { createNotification } from '../notifications/service';
import { cacheInvalidate, courseMetaCacheKey } from '../cache/courseCache';

export const adminRouter = Router();

// All admin routes are admin-only (backend RBAC is authoritative).
// NOTE: auth middleware is applied per-route (not via router.use), because
// this router is mounted at the shared /api/v1 prefix — router-level
// middleware would run for unrelated routes and wrongly 403 them.
const requireAdmin = [authenticate, authorize('admin')];

const usersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(255).optional(),
  role: z.enum(['student', 'instructor', 'admin']).optional(),
});

adminRouter.get('/admin/users', ...requireAdmin, async (req, res, next) => {
  try {
    const { page, pageSize, q, role } = usersQuery.parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(u.email ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
    }
    if (role) {
      params.push(role);
      where.push(`EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.name = $${params.length})`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await db.query(`SELECT COUNT(*)::int AS count FROM users u ${clause}`, params);
    params.push(pageSize, (page - 1) * pageSize);
    // Select users first, then attach roles per user (keeps pg-mem + Postgres parity).
    let suspendedAvailable = true;
    let rows;
    try {
      rows = await db.query(
        `SELECT u.id, u.email, u.name, u.is_suspended, u.suspended_at, u.created_at
         FROM users u ${clause} ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
    } catch {
      suspendedAvailable = false;
      rows = await db.query(
        `SELECT u.id, u.email, u.name, u.created_at FROM users u ${clause} ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
    }
    const data: Record<string, unknown>[] = [];
    for (const r of rows.rows as { id: string }[]) {
      const roles = await db.query(
        `SELECT r.name AS name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1 ORDER BY r.name`,
        [r.id],
      );
      data.push({
        ...(r as object),
        is_suspended: suspendedAvailable ? (r as unknown as { is_suspended: boolean }).is_suspended : false,
        roles: roles.rows.map((x) => (x as { name: string }).name),
      });
    }
    res.json({ data, page, pageSize, total: (total.rows[0] as { count: number }).count });
  } catch (err) {
    next(err);
  }
});

const roleSchema = z.object({
  role: z.enum(['student', 'instructor', 'admin']),
  action: z.enum(['assign', 'revoke']).default('assign'),
});

adminRouter.put('/admin/users/:id/role', validateBody(roleSchema), ...requireAdmin, async (req, res, next) => {
  try {
    const target = await db.query(`SELECT id, email FROM users WHERE id = $1`, [req.params.id]);
    if (!target.rowCount) {
      next(notFound('User not found'));
      return;
    }
    const { role, action } = req.body as z.infer<typeof roleSchema>;
    const roleRow = await db.query(`SELECT id FROM roles WHERE name = $1`, [role]);
    const roleId = (roleRow.rows[0] as { id: string } | undefined)?.id;
    if (!roleId) {
      next(notFound('Role not found'));
      return;
    }
    if (action === 'assign') {
      await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [req.params.id, roleId]);
    } else {
      // Prevent admins from stripping their own admin role (lockout guard).
      if (req.params.id === req.user!.id && role === 'admin') {
        next(forbidden('You cannot revoke your own admin role'));
        return;
      }
      // Prevent removing the last admin.
      if (role === 'admin') {
        const admins = await db.query(
          `SELECT COUNT(*)::int AS count FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'admin'`,
        );
        const targetIsAdmin = await db.query(
          `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 AND r.name = 'admin'`,
          [req.params.id],
        );
        if (targetIsAdmin.rowCount && (admins.rows[0] as { count: number }).count <= 1) {
          next(conflict('Cannot revoke the last admin role'));
          return;
        }
      }
      await db.query(`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`, [req.params.id, roleId]);
    }
    const roles = await db.query(
      `SELECT r.name AS name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1 ORDER BY r.name`,
      [req.params.id],
    );
    res.json({ id: req.params.id, roles: roles.rows.map((r) => (r as { name: string }).name) });
  } catch (err) {
    next(err);
  }
});

const suspendSchema = z.object({
  suspended: z.boolean(),
  reason: z.string().max(1000).default(''),
});

adminRouter.put('/admin/users/:id/suspend', validateBody(suspendSchema), ...requireAdmin, async (req, res, next) => {
  try {
    if (req.params.id === req.user!.id) {
      next(forbidden('You cannot suspend your own account'));
      return;
    }
    const target = await db.query(`SELECT id FROM users WHERE id = $1`, [req.params.id]);
    if (!target.rowCount) {
      next(notFound('User not found'));
      return;
    }
    const { suspended, reason } = req.body as z.infer<typeof suspendSchema>;
    try {
      if (suspended) {
        await db.query(`UPDATE users SET is_suspended = true, suspended_at = now(), suspended_reason = $2 WHERE id = $1`, [
          req.params.id,
          reason,
        ]);
        // Revoke active refresh tokens so suspension takes effect promptly.
        await db.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [req.params.id]);
      } else {
        await db.query(`UPDATE users SET is_suspended = false, suspended_at = NULL, suspended_reason = '' WHERE id = $1`, [req.params.id]);
      }
    } catch {
      // Migration 004 not applied: report honestly instead of pretending.
      next(conflict('User suspension is unavailable: apply migration 004 first'));
      return;
    }
    const updated = await db.query(`SELECT id, email, name, is_suspended, suspended_at FROM users WHERE id = $1`, [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/admin/users/:id', ...requireAdmin, async (req, res, next) => {
  try {
    if (req.params.id === req.user!.id) {
      next(forbidden('You cannot delete your own account'));
      return;
    }
    const target = await db.query(`SELECT id FROM users WHERE id = $1`, [req.params.id]);
    if (!target.rowCount) {
      next(notFound('User not found'));
      return;
    }
    // Block deleting the last admin.
    const targetIsAdmin = await db.query(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1 AND r.name = 'admin'`,
      [req.params.id],
    );
    if (targetIsAdmin.rowCount) {
      const admins = await db.query(
        `SELECT COUNT(*)::int AS count FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'admin'`,
      );
      if ((admins.rows[0] as { count: number }).count <= 1) {
        next(conflict('Cannot delete the last admin'));
        return;
      }
    }
    // Block deleting instructors with existing courses (safe-delete rule).
    const owned = await db.query(`SELECT COUNT(*)::int AS count FROM courses WHERE instructor_id = $1`, [req.params.id]);
    if ((owned.rows[0] as { count: number }).count > 0) {
      next(conflict('Cannot delete a user who owns courses; reassign or remove courses first'));
      return;
    }
    await db.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Pending course approval queue (uses existing course status model).
adminRouter.get('/admin/courses/pending', ...requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const total = await db.query(`SELECT COUNT(*)::int AS count FROM courses WHERE status = 'pending'`);
    const rows = await db.query(
      `SELECT c.id, c.title, c.description, c.status, c.instructor_id, u.email AS instructor_email, u.name AS instructor_name, c.created_at
       FROM courses c JOIN users u ON u.id = c.instructor_id
       WHERE c.status = 'pending' ORDER BY c.created_at LIMIT $1 OFFSET $2`,
      [pageSize, (page - 1) * pageSize],
    );
    res.json({ data: rows.rows, page, pageSize, total: (total.rows[0] as { count: number }).count });
  } catch (err) {
    next(err);
  }
});

const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().max(2000).default(''),
});

async function decideCourse(courseId: string, reviewerId: string, decision: 'approved' | 'rejected', comment: string) {
  const existing = await db.query(`SELECT id, instructor_id, title FROM courses WHERE id = $1`, [courseId]);
  const course = existing.rows[0] as { id: string; instructor_id: string; title: string } | undefined;
  if (!course) return null;
  const status = decision === 'approved' ? 'published' : 'rejected';
  await db.query(`UPDATE courses SET status = $1, updated_at = now() WHERE id = $2`, [status, courseId]);
  try {
    await db.query(
      `INSERT INTO course_approvals (id, course_id, requested_by, reviewer_id, decision, comment, decided_at) VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [newId(), courseId, course.instructor_id, reviewerId, decision, comment],
    );
  } catch {
    // Approval history table missing (migration 004 not applied): status change still stands.
  }
  await createNotification({
    userId: course.instructor_id,
    type: decision === 'approved' ? 'course_approved' : 'course_rejected',
    title: decision === 'approved' ? `Course approved: ${course.title}` : `Course rejected: ${course.title}`,
    body: comment || decision,
    link: `/instructor/courses`,
  });
  const updated = await db.query(`SELECT id, title, description, status, instructor_id, created_at, updated_at FROM courses WHERE id = $1`, [courseId]);
  // Approval changes catalog visibility — invalidate catalog + course caches.
  await cacheInvalidate('vl:catalog');
  await cacheInvalidate(courseMetaCacheKey(courseId));
  return updated.rows[0] as Record<string, unknown>;
}

adminRouter.post('/admin/courses/:id/approve', validateBody(z.object({ comment: z.string().max(2000).default('') })), ...requireAdmin, async (req, res, next) => {
  try {
    const out = await decideCourse(req.params.id, req.user!.id, 'approved', (req.body as { comment: string }).comment ?? '');
    if (!out) {
      next(notFound('Course not found'));
      return;
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/admin/courses/:id/reject', validateBody(z.object({ comment: z.string().max(2000).default('') })), ...requireAdmin, async (req, res, next) => {
  try {
    const out = await decideCourse(req.params.id, req.user!.id, 'rejected', (req.body as { comment: string }).comment ?? '');
    if (!out) {
      next(notFound('Course not found'));
      return;
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

// Unified decision endpoint (convenience; same lifecycle, single approval mechanism).
adminRouter.post('/admin/courses/:id/decision', validateBody(decisionSchema), ...requireAdmin, async (req, res, next) => {
  try {
    const { decision, comment } = req.body as z.infer<typeof decisionSchema>;
    const out = await decideCourse(req.params.id, req.user!.id, decision, comment);
    if (!out) {
      next(notFound('Course not found'));
      return;
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/admin/courses/:id/approvals', ...requireAdmin, async (req, res, next) => {
  try {
    const course = await db.query(`SELECT id FROM courses WHERE id = $1`, [req.params.id]);
    if (!course.rowCount) {
      next(notFound('Course not found'));
      return;
    }
    try {
      const rows = await db.query(
        `SELECT id, course_id, requested_by, reviewer_id, decision, comment, created_at, decided_at FROM course_approvals WHERE course_id = $1 ORDER BY created_at DESC`,
        [req.params.id],
      );
      res.json({ data: rows.rows });
    } catch {
      res.json({ data: [], unavailable: 'course_approvals table missing: apply migration 004' });
    }
  } catch (err) {
    next(err);
  }
});

// Platform analytics from REAL data only. Revenue is explicitly unavailable
// (no payment data exists) and is exposed as a zero/empty-state with a reason.
adminRouter.get('/admin/analytics/overview', ...requireAdmin, async (_req, res, next) => {
  try {
    const users = await db.query(`SELECT COUNT(*)::int AS count FROM users`);
    const byRole = await db.query(
      `SELECT r.name AS role, COUNT(*)::int AS count FROM user_roles ur JOIN roles r ON r.id = ur.role_id GROUP BY r.name`,
    );
    const coursesByStatus = await db.query(`SELECT status, COUNT(*)::int AS count FROM courses GROUP BY status`);
    const enrollments = await db.query(`SELECT COUNT(*)::int AS count FROM enrollments`);
    const completions = await db.query(`SELECT COUNT(*)::int AS count FROM enrollments WHERE completed_at IS NOT NULL`);
    const certificates = await db.query(`SELECT COUNT(*)::int AS count FROM certificates`);
    let last7 = 0;
    try {
      const recentEnrollments = await db.query(`SELECT COUNT(*)::int AS count FROM enrollments WHERE created_at >= now() - INTERVAL '7 days'`);
      last7 = (recentEnrollments.rows[0] as { count: number }).count ?? 0;
    } catch {
      last7 = 0;
    }
    // DAU estimate: distinct users active in the last 24h via progress + enrollments + logins(refresh tokens).
    let dau = 0;
    let dauSources: Record<string, number> = {};
    try {
      const active = await db.query(
        `SELECT COUNT(DISTINCT user_id)::int AS count FROM lecture_progress WHERE updated_at >= now() - INTERVAL '1 day'`,
      );
      dauSources.progress = (active.rows[0] as { count: number }).count;
    } catch {
      dauSources.progress = 0;
    }
    try {
      const enrolled = await db.query(`SELECT COUNT(DISTINCT user_id)::int AS count FROM enrollments WHERE created_at >= now() - INTERVAL '1 day'`);
      dauSources.enrollments = (enrolled.rows[0] as { count: number }).count;
    } catch {
      dauSources.enrollments = 0;
    }
    dau = Math.max(dauSources.progress ?? 0, dauSources.enrollments ?? 0);
    const totalEnr = (enrollments.rows[0] as { count: number }).count;
    const totalComp = (completions.rows[0] as { count: number }).count;
    res.json({
      users: { total: (users.rows[0] as { count: number }).count, byRole: byRole.rows },
      courses: { byStatus: coursesByStatus.rows },
      enrollments: {
        total: totalEnr,
        last7Days: last7,
        completions: totalComp,
        completionRate: totalEnr ? totalComp / totalEnr : 0,
      },
      certificates: { total: (certificates.rows[0] as { count: number }).count },
      dau: { last24hActiveUsers: dau, sources: dauSources, note: 'Estimate from lecture_progress + enrollments activity; no separate activity table exists.' },
      revenue: await revenuePayload(),
    });
  } catch (err) {
    next(err);
  }
});

// Flagged forum moderation queue (platform-wide for admins).
adminRouter.get('/admin/moderation/flagged-posts', ...requireAdmin, async (_req, res, next) => {
  try {
    try {
      const rows = await db.query(
        `SELECT p.id, p.thread_id, p.author_id, p.body, p.is_hidden, p.flag_count, p.created_at,
                t.course_id, t.title AS thread_title
         FROM discussion_posts p JOIN discussion_threads t ON t.id = p.thread_id
         WHERE p.flag_count > 0 ORDER BY p.flag_count DESC, p.created_at DESC LIMIT 100`,
      );
      const data: Record<string, unknown>[] = [];
      for (const p of rows.rows as { id: string }[]) {
        const flags = await db.query(`SELECT reason FROM discussion_flags WHERE post_id = $1 AND status = 'open'`, [p.id]).catch(
          () => ({ rows: [] as Record<string, unknown>[] }),
        );
        data.push({
          ...(p as object),
          flag_reasons: flags.rows.map((f) => (f as { reason: string }).reason),
          open_flags: flags.rows.length,
        });
      }
      res.json({ data });
    } catch {
      res.json({ data: [], unavailable: 'discussion tables missing: apply migration 004' });
    }
  } catch (err) {
    next(err);
  }
});

const moderationActionSchema = z.object({
  action: z.enum(['resolve', 'dismiss', 'hide', 'unhide', 'delete']),
});
adminRouter.put('/admin/moderation/posts/:postId', validateBody(moderationActionSchema), ...requireAdmin, async (req, res, next) => {
  try {
    const post = await db.query(`SELECT id, thread_id FROM discussion_posts WHERE id = $1`, [req.params.postId]).catch(() => ({ rows: [], rowCount: 0 }));
    if (!post.rowCount) {
      next(notFound('Post not found'));
      return;
    }
    const { action } = req.body as z.infer<typeof moderationActionSchema>;
    if (action === 'delete') {
      await db.query(`DELETE FROM discussion_posts WHERE id = $1`, [req.params.postId]);
      await db.query(`UPDATE discussion_flags SET status = 'resolved' WHERE post_id = $1`, [req.params.postId]).catch(() => undefined);
      res.json({ id: req.params.postId, action, deleted: true });
      return;
    }
    if (action === 'hide') {
      await db.query(`UPDATE discussion_posts SET is_hidden = true WHERE id = $1`, [req.params.postId]);
    } else if (action === 'unhide') {
      await db.query(`UPDATE discussion_posts SET is_hidden = false WHERE id = $1`, [req.params.postId]);
    }
    if (action === 'resolve' || action === 'hide') {
      await db.query(`UPDATE discussion_flags SET status = 'resolved' WHERE post_id = $1 AND status = 'open'`, [req.params.postId]).catch(() => undefined);
      // Resolved flags must clear the queue counter or the post stays listed forever.
      await db.query(`UPDATE discussion_posts SET flag_count = 0 WHERE id = $1`, [req.params.postId]).catch(() => undefined);
    } else if (action === 'dismiss') {
      await db.query(`UPDATE discussion_flags SET status = 'dismissed' WHERE post_id = $1 AND status = 'open'`, [req.params.postId]).catch(() => undefined);
      await db.query(`UPDATE discussion_posts SET flag_count = 0 WHERE id = $1`, [req.params.postId]).catch(() => undefined);
    }
    const updated = await db.query(`SELECT id, thread_id, author_id, body, is_hidden, flag_count FROM discussion_posts WHERE id = $1`, [req.params.postId]);
    res.json({ ...(updated.rows[0] as object), action });
  } catch (err) {
    next(err);
  }
});

const paymentSchema = z.object({
  userId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  amountCents: z.number().int().min(0).max(100000000),
  currency: z.string().length(3).default('USD'),
  status: z.enum(['pending', 'completed', 'refunded', 'failed']).default('completed'),
  provider: z.string().max(64).default('manual'),
  providerRef: z.string().max(255).default(''),
});

/**
 * Record a payment (admin only). This is the real ingress path for revenue
 * analytics — manual recording or a future provider webhook — never fake data.
 * No payment gateway is implemented in this phase.
 */
adminRouter.post('/admin/payments', ...requireAdmin, validateBody(paymentSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof paymentSchema>;
    if (body.userId) {
      const u = await db.query(`SELECT id FROM users WHERE id = $1`, [body.userId]);
      if (!u.rowCount) {
        next(notFound('User not found'));
        return;
      }
    }
    if (body.courseId) {
      const c = await db.query(`SELECT id FROM courses WHERE id = $1`, [body.courseId]);
      if (!c.rowCount) {
        next(notFound('Course not found'));
        return;
      }
    }
    try {
      const id = newId();
      await db.query(
        `INSERT INTO payments (id, user_id, course_id, amount_cents, currency, status, provider, provider_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, body.userId ?? null, body.courseId ?? null, body.amountCents, body.currency.toUpperCase(), body.status, body.provider, body.providerRef ?? ''],
      );
      const created = await db.query(
        `SELECT id, user_id, course_id, amount_cents, currency, status, provider, provider_ref, created_at FROM payments WHERE id = $1`,
        [id],
      );
      res.status(201).json(created.rows[0]);
    } catch {
      next(conflict('Payments are unavailable: apply migration 005'));
    }
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/admin/payments', ...requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
    try {
      const rows = await db.query(
        `SELECT p.id, p.user_id, p.course_id, p.amount_cents, p.currency, p.status, p.provider, p.provider_ref, p.created_at,
                u.email AS user_email, c.title AS course_title
         FROM payments p LEFT JOIN users u ON u.id = p.user_id LEFT JOIN courses c ON c.id = p.course_id
         ORDER BY p.created_at DESC LIMIT $1`,
        [limit],
      );
      res.json({ data: rows.rows });
    } catch {
      res.json({ data: [], unavailable: 'payments table missing: apply migration 005' });
    }
  } catch (err) {
    next(err);
  }
});

/** Status-aware revenue aggregation over real payment records only. */
export async function revenueSummary(): Promise<{
  totals: { currency: string; total_cents: number }[];
  counts: Record<string, number>;
  recorded: number;
}> {
  try {
    const totals = await db.query(
      `SELECT currency, SUM(amount_cents)::int AS total_cents FROM payments WHERE status = 'completed' GROUP BY currency`,
    );
    const counts = await db.query(`SELECT status, COUNT(*)::int AS count FROM payments GROUP BY status`);
    const recorded = await db.query(`SELECT COUNT(*)::int AS count FROM payments`);
    const byStatus: Record<string, number> = {};
    for (const r of counts.rows as { status: string; count: number }[]) byStatus[r.status] = r.count;
    return {
      totals: totals.rows as { currency: string; total_cents: number }[],
      counts: byStatus,
      recorded: (recorded.rows[0] as { count: number }).count,
    };
  } catch {
    return { totals: [], counts: {}, recorded: 0 };
  }
}

/**
 * Revenue payload: real aggregation plus backward-compatible fields
 * (`total`/`currency`/`unavailable`/`reason`) so Phase 5 clients keep working.
 * With no payment records the dashboard honestly shows zero — never fabricated.
 */
export async function revenuePayload(): Promise<Record<string, unknown>> {
  const summary = await revenueSummary();
  const primary = summary.totals.find((t) => t.currency === 'USD') ?? summary.totals[0];
  return {
    ...summary,
    total: primary ? primary.total_cents : 0,
    currency: primary ? primary.currency : 'USD',
    unavailable: summary.recorded === 0,
    reason: summary.recorded === 0 ? 'No payment records exist; revenue cannot be calculated.' : undefined,
    note: 'Real payment records only (status=completed). No gateway; records are entered via POST /admin/payments.',
  };
}
