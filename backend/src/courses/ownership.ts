import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/pool';
import { forbidden, notFound } from '../errors';

export async function requireCourseOwner(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const courseId = (req.params as Record<string, string>).id ?? (req.params as Record<string, string>).courseId;
    if (!courseId) {
      next(notFound('Course not found'));
      return;
    }
    if (req.user?.roles.includes('admin')) {
      next();
      return;
    }
    const res = await db.query(`SELECT instructor_id FROM courses WHERE id = $1`, [courseId]);
    const row = res.rows[0] as { instructor_id: string } | undefined;
    if (!row) {
      next(notFound('Course not found'));
      return;
    }
    if (row.instructor_id !== req.user?.id) {
      next(forbidden('You do not own this course'));
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export async function getModuleCourseId(moduleId: string): Promise<string | undefined> {
  const res = await db.query(`SELECT course_id FROM modules WHERE id = $1`, [moduleId]);
  return (res.rows[0] as { course_id: string } | undefined)?.course_id;
}

export async function requireModuleOwner(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const moduleId = (req.params as Record<string, string>).id;
    if (req.user?.roles.includes('admin')) {
      next();
      return;
    }
    const courseId = await getModuleCourseId(moduleId);
    if (!courseId) {
      next(notFound('Module not found'));
      return;
    }
    const res = await db.query(`SELECT instructor_id FROM courses WHERE id = $1`, [courseId]);
    const row = res.rows[0] as { instructor_id: string } | undefined;
    if (!row) {
      next(notFound('Course not found'));
      return;
    }
    if (row.instructor_id !== req.user?.id) {
      next(forbidden('You do not own this course'));
      return;
    }
    (req as Request & { courseId?: string }).courseId = courseId;
    next();
  } catch (err) {
    next(err);
  }
}
