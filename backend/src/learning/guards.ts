import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/pool';
import { forbidden, notFound } from '../errors';

export interface LectureCourseRef {
  lectureId: string;
  moduleId: string;
  courseId: string;
  courseStatus: string;
  instructorId: string;
}

export async function getLectureCourse(lectureId: string): Promise<LectureCourseRef | undefined> {
  const res = await db.query(
    `SELECT l.id AS lecture_id, l.module_id AS module_id, c.id AS course_id, c.status AS course_status, c.instructor_id AS instructor_id
     FROM lectures l JOIN modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id WHERE l.id = $1`,
    [lectureId],
  );
  const row = res.rows[0] as
    | { lecture_id: string; module_id: string; course_id: string; course_status: string; instructor_id: string }
    | undefined;
  if (!row) return undefined;
  return { lectureId: row.lecture_id, moduleId: row.module_id, courseId: row.course_id, courseStatus: row.course_status, instructorId: row.instructor_id };
}

export async function isEnrolled(userId: string, courseId: string): Promise<boolean> {
  const res = await db.query(`SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`, [userId, courseId]);
  return Boolean(res.rowCount);
}

export async function requireEnrollment(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const lectureId = (req.params as Record<string, string>).id;
    const ref = await getLectureCourse(lectureId);
    if (!ref) {
      next(notFound('Lecture not found'));
      return;
    }
    if (req.user?.roles.includes('admin')) {
      next();
      return;
    }
    if (req.user && req.user.id === ref.instructorId) {
      (req as Request & { lectureCourse?: LectureCourseRef }).lectureCourse = ref;
      next();
      return;
    }
    if (!req.user || !(await isEnrolled(req.user.id, ref.courseId))) {
      next(forbidden('Enrollment required'));
      return;
    }
    (req as Request & { lectureCourse?: LectureCourseRef }).lectureCourse = ref;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAssignmentAccess(
  assignmentId: string,
  user: { id: string; roles: string[] },
): Promise<{ assignment: Record<string, unknown>; courseInstructorId: string } | { error: 'not_found' }> {
  const res = await db.query(
    `SELECT a.id, a.course_id, a.instructor_id, a.title, a.description, a.due_at, a.max_score, c.instructor_id AS course_instructor
     FROM assignments a JOIN courses c ON c.id = a.course_id WHERE a.id = $1`,
    [assignmentId],
  );
  const row = res.rows[0] as
    | { id: string; course_id: string; instructor_id: string; title: string; description: string; due_at: string | null; max_score: number; course_instructor: string }
    | undefined;
  if (!row) return { error: 'not_found' };
  return { assignment: row as unknown as Record<string, unknown>, courseInstructorId: row.course_instructor };
}

export function canGradeAssignment(assignmentInstructorId: string, courseInstructorId: string, user: { id: string; roles: string[] }): boolean {
  if (user.roles.includes('admin')) return true;
  return user.id === assignmentInstructorId || user.id === courseInstructorId;
}
