import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import { db, newId } from '../db/pool';
import { forbidden, notFound } from '../errors';
import { validateBody } from '../middleware/validate';
import { isEnrolled } from '../learning/guards';
import { notifyEnrolledStudents } from '../notifications/service';

export const announcementsRouter = Router();

// NOTE: authenticate is applied per-route (not via router.use) because this
// router is mounted at the shared /api/v1 prefix.

const announcementSchema = z.object({
  title: z.string().min(3).max(255),
  body: z.string().min(1).max(10000),
});

// Instructor creates an announcement for a course they own (admins bypass ownership).
announcementsRouter.post('/courses/:courseId/announcements', validateBody(announcementSchema), authenticate, async (req, res, next) => {
  try {
    const courseRes = await db.query(`SELECT id, instructor_id, title FROM courses WHERE id = $1`, [req.params.courseId]);
    const course = courseRes.rows[0] as { id: string; instructor_id: string; title: string } | undefined;
    if (!course) {
      next(notFound('Course not found'));
      return;
    }
    const user = req.user!;
    const canPublish =
      user.roles.includes('admin') || (user.roles.includes('instructor') && course.instructor_id === user.id);
    if (!canPublish) {
      next(forbidden('Only the course instructor can publish announcements'));
      return;
    }
    const body = req.body as z.infer<typeof announcementSchema>;
    const id = newId();
    await db.query(`INSERT INTO announcements (id, course_id, author_id, title, body) VALUES ($1, $2, $3, $4, $5)`, [
      id,
      course.id,
      user.id,
      body.title,
      body.body,
    ]);
    // Notify enrolled students (in-app; failures are best-effort).
    await notifyEnrolledStudents(
      course.id,
      (userId) => ({
        type: 'announcement',
        title: `New announcement in ${course.title}`,
        body: body.title,
        link: `/courses/${course.id}`,
        userId,
      }),
      user.id,
    );
    const created = await db.query(`SELECT id, course_id, author_id, title, body, created_at FROM announcements WHERE id = $1`, [id]);
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Enrolled students (plus owner/admin) can view announcements.
announcementsRouter.get('/courses/:courseId/announcements', authenticate, async (req, res, next) => {
  try {
    const courseRes = await db.query(`SELECT id, instructor_id FROM courses WHERE id = $1`, [req.params.courseId]);
    const course = courseRes.rows[0] as { id: string; instructor_id: string } | undefined;
    if (!course) {
      next(notFound('Course not found'));
      return;
    }
    const user = req.user!;
    const isAdmin = user.roles.includes('admin');
    const isOwner = course.instructor_id === user.id;
    if (!isAdmin && !isOwner && !(await isEnrolled(user.id, course.id))) {
      next(forbidden('Enrollment required'));
      return;
    }
    const rows = await db.query(
      `SELECT a.id, a.course_id, a.author_id, a.title, a.body, a.created_at, u.name AS author_name FROM announcements a JOIN users u ON u.id = a.author_id WHERE a.course_id = $1 ORDER BY a.created_at DESC`,
      [course.id],
    );
    res.json({ data: rows.rows });
  } catch (err) {
    next(err);
  }
});
