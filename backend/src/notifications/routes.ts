import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import { db } from '../db/pool';
import { notFound } from '../errors';
import { sendEmail } from '../email/service';

export const notificationsRouter = Router();

// NOTE: authenticate is applied per-route (not via router.use) because this
// router is mounted at the shared /api/v1 prefix.

// List my notifications (never another user's: user_id always from JWT).
notificationsRouter.get('/notifications/me', authenticate, async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
    const rows = await db.query(
      `SELECT id, type, title, body, link, is_read, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.user!.id, limit],
    );
    res.json({ data: rows.rows });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.get('/notifications/unread-count', authenticate, async (req, res, next) => {
  try {
    const rows = await db.query(`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false`, [req.user!.id]);
    res.json({ unread: (rows.rows[0] as { count: number }).count });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.put('/notifications/read-all', authenticate, async (req, res, next) => {
  try {
    const out = await db.query(`UPDATE notifications SET is_read = true, read_at = now() WHERE user_id = $1 AND is_read = false`, [req.user!.id]);
    res.json({ updated: out.rowCount ?? 0 });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.put('/notifications/:id/read', authenticate, async (req, res, next) => {
  try {
    const existing = await db.query(`SELECT id FROM notifications WHERE id = $1 AND user_id = $2`, [req.params.id, req.user!.id]);
    if (!existing.rowCount) {
      next(notFound('Notification not found'));
      return;
    }
    await db.query(`UPDATE notifications SET is_read = true, read_at = now() WHERE id = $1`, [req.params.id]);
    const updated = await db.query(`SELECT id, type, title, body, link, is_read, created_at, read_at FROM notifications WHERE id = $1`, [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Email status probe: reports provider availability honestly, never fabricates delivery.
notificationsRouter.get('/notifications/email-status', authenticate, async (_req, res) => {
  const { emailProviderName } = await import('../email/service');
  const provider = emailProviderName();
  const configured = provider !== '' && provider !== 'unconfigured' && provider !== 'mock';
  res.json({ provider: provider || 'unconfigured', configured, note: 'Email delivery requires EMAIL_PROVIDER configuration; tests use the mocked transport.' });
});

const testEmailSchema = z.object({
  to: z.string().email().max(255),
  subject: z.string().min(1).max(255).default('VertexLearn test email'),
  text: z.string().max(5000).default('Test message'),
});

// Authenticated probe that exercises the email abstraction without real delivery in tests.
notificationsRouter.post('/notifications/test-email', authenticate, async (req, res, next) => {
  try {
    const parsed = testEmailSchema.parse(req.body ?? {});
    const result = await sendEmail({ to: parsed.to, subject: parsed.subject, text: parsed.text });
    res.json({ ...result, to: parsed.to });
  } catch (err) {
    next(err);
  }
});
