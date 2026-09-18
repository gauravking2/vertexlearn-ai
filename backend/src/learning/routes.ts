import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../auth/middleware';
import { db, newId } from '../db/pool';
import { conflict, forbidden, notFound } from '../errors';
import { validateBody } from '../middleware/validate';
import { requireCourseOwner } from '../courses/ownership';
import { buildSubmissionUploadTarget } from '../storage/objectStore';
import { createNotification } from '../notifications/service';
import { issueCertificateIfComplete } from './certificates';
import { canGradeAssignment, getLectureCourse, isEnrolled, requireAssignmentAccess, requireEnrollment } from './guards';
import { gradeObjectiveQuestion, normalizeIdList } from './quizzes';
import { awardBadge, recalculateCourseProgress, touchStreak } from './progress';

export const learningRouter = Router();

const progressSchema = z.object({
  watchedSeconds: z.number().int().min(0).max(86400).default(0),
  completed: z.boolean().optional(),
});

const noteSchema = z.object({
  timestampSeconds: z.number().int().min(0).max(86400).default(0),
  content: z.string().min(1).max(10000),
});

const bookmarkSchema = z.object({
  timestampSeconds: z.number().int().min(0).max(86400),
});

const assignmentCreateSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(10000).default(''),
  dueAt: z.string().datetime().optional(),
  maxScore: z.number().int().min(1).max(10000).default(100),
});

const assignmentUpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(10000).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  maxScore: z.number().int().min(1).max(10000).optional(),
});

const submitSchema = z.object({
  fileName: z.string().min(1).max(255).optional(),
  fileSizeBytes: z.number().int().min(0).max(500 * 1024 * 1024).optional(),
  mimeType: z.string().max(127).optional(),
  contentText: z.string().max(50000).default(''),
});

const gradeSchema = z.object({
  grade: z.number().int().min(0),
  feedback: z.string().max(10000).default(''),
});

const questionInput = z.object({
  type: z.enum(['mcq', 'multi_select', 'short_answer']),
  prompt: z.string().min(1).max(5000),
  points: z.number().int().min(1).max(1000).default(1),
  options: z
    .array(z.object({ text: z.string().min(1).max(2000), isCorrect: z.boolean().default(false) }))
    .min(2)
    .max(20)
    .optional(),
});

const quizCreateSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().max(10000).default(''),
  questions: z.array(questionInput).min(1).max(100),
});

const attemptSubmitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedOptionIds: z.array(z.string().uuid()).default([]),
        answerText: z.string().max(10000).default(''),
      }),
    )
    .min(1)
    .max(200),
});

learningRouter.post('/courses/:id/enroll', authenticate, authorize('student', 'admin'), async (req, res, next) => {
  try {
    const courseRes = await db.query(`SELECT id, status FROM courses WHERE id = $1`, [req.params.id]);
    const course = courseRes.rows[0] as { id: string; status: string } | undefined;
    if (!course) {
      next(notFound('Course not found'));
      return;
    }
    if (course.status !== 'published') {
      next(forbidden('Course is not open for enrollment'));
      return;
    }
    const existing = await db.query(`SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`, [req.user!.id, course.id]);
    if (existing.rowCount) {
      next(conflict('Already enrolled'));
      return;
    }
    const id = newId();
    await db.query(`INSERT INTO enrollments (id, user_id, course_id, progress_percent) VALUES ($1, $2, $3, 0)`, [id, req.user!.id, course.id]);
    await touchStreak(req.user!.id);
    const created = await db.query(`SELECT id, user_id, course_id, progress_percent, completed_at, created_at FROM enrollments WHERE id = $1`, [id]);
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/enrollments/me', authenticate, authorize('student', 'admin'), async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT e.id, e.course_id, e.progress_percent, e.completed_at, e.created_at, c.title AS course_title, c.status AS course_status
       FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = $1 ORDER BY e.created_at DESC`,
      [req.user!.id],
    );
    res.json({ data: rows.rows });
  } catch (err) {
    next(err);
  }
});

learningRouter.post('/lectures/:id/progress', authenticate, authorize('student', 'admin'), requireEnrollment, validateBody(progressSchema), async (req, res, next) => {
  try {
    const lectureId = req.params.id;
    const ref = await getLectureCourse(lectureId);
    if (!ref) {
      next(notFound('Lecture not found'));
      return;
    }
    const body = req.body as { watchedSeconds: number; completed?: boolean };
    const existing = await db.query(`SELECT id FROM lecture_progress WHERE user_id = $1 AND lecture_id = $2`, [req.user!.id, lectureId]);
    if (existing.rowCount) {
      await db.query(
        `UPDATE lecture_progress SET watched_seconds = GREATEST(watched_seconds, $1), completed = $2 OR completed, last_watched_at = now(), updated_at = now() WHERE user_id = $3 AND lecture_id = $4`,
        [body.watchedSeconds, body.completed === true, req.user!.id, lectureId],
      );
    } else {
      await db.query(
        `INSERT INTO lecture_progress (id, user_id, lecture_id, watched_seconds, completed) VALUES ($1, $2, $3, $4, $5)`,
        [newId(), req.user!.id, lectureId, body.watchedSeconds, body.completed === true],
      );
    }
    const percent = await recalculateCourseProgress(req.user!.id, ref.courseId);
    await touchStreak(req.user!.id);
    const cert = await issueCertificateIfComplete(req.user!.id, ref.courseId);
    const saved = await db.query(`SELECT id, user_id, lecture_id, watched_seconds, completed, last_watched_at FROM lecture_progress WHERE user_id = $1 AND lecture_id = $2`, [
      req.user!.id,
      lectureId,
    ]);
    res.json({ progress: saved.rows[0], courseProgressPercent: percent, certificate: cert?.certificate ?? null });
  } catch (err) {
    next(err);
  }
});

learningRouter.post('/lectures/:id/notes', authenticate, authorize('student', 'admin'), requireEnrollment, validateBody(noteSchema), async (req, res, next) => {
  try {
    const body = req.body as { timestampSeconds: number; content: string };
    const id = newId();
    await db.query(`INSERT INTO notes (id, user_id, lecture_id, timestamp_seconds, content) VALUES ($1, $2, $3, $4, $5)`, [
      id,
      req.user!.id,
      req.params.id,
      body.timestampSeconds,
      body.content,
    ]);
    await touchStreak(req.user!.id);
    const created = await db.query(`SELECT id, user_id, lecture_id, timestamp_seconds, content, created_at FROM notes WHERE id = $1`, [id]);
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/lectures/:id/notes', authenticate, authorize('student', 'admin'), requireEnrollment, async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id, user_id, lecture_id, timestamp_seconds, content, created_at FROM notes WHERE user_id = $1 AND lecture_id = $2 ORDER BY timestamp_seconds`,
      [req.user!.id, req.params.id],
    );
    res.json({ data: rows.rows });
  } catch (err) {
    next(err);
  }
});

learningRouter.post('/lectures/:id/bookmarks', authenticate, authorize('student', 'admin'), requireEnrollment, validateBody(bookmarkSchema), async (req, res, next) => {
  try {
    const body = req.body as { timestampSeconds: number };
    const existing = await db.query(`SELECT id FROM bookmarks WHERE user_id = $1 AND lecture_id = $2 AND timestamp_seconds = $3`, [
      req.user!.id,
      req.params.id,
      body.timestampSeconds,
    ]);
    if (existing.rowCount) {
      next(conflict('Bookmark already exists at this timestamp'));
      return;
    }
    const id = newId();
    await db.query(`INSERT INTO bookmarks (id, user_id, lecture_id, timestamp_seconds) VALUES ($1, $2, $3, $4)`, [
      id,
      req.user!.id,
      req.params.id,
      body.timestampSeconds,
    ]);
    await touchStreak(req.user!.id);
    const created = await db.query(`SELECT id, user_id, lecture_id, timestamp_seconds, created_at FROM bookmarks WHERE id = $1`, [id]);
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/lectures/:id/bookmarks', authenticate, authorize('student', 'admin'), requireEnrollment, async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id, user_id, lecture_id, timestamp_seconds, created_at FROM bookmarks WHERE user_id = $1 AND lecture_id = $2 ORDER BY timestamp_seconds`,
      [req.user!.id, req.params.id],
    );
    res.json({ data: rows.rows });
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/courses/:id/assignments', authenticate, async (req, res, next) => {
  try {
    const courseRes = await db.query(`SELECT id, instructor_id FROM courses WHERE id = $1`, [req.params.id]);
    const course = courseRes.rows[0] as { id: string; instructor_id: string } | undefined;
    if (!course) {
      next(notFound('Course not found'));
      return;
    }
    const user = req.user!;
    const isAdmin = user.roles.includes('admin');
    const isOwner = course.instructor_id === user.id;
    const enrolled = !isAdmin && !isOwner ? await isEnrolled(user.id, course.id) : true;
    if (!isAdmin && !isOwner && !enrolled) {
      // Instructors who do not own the course and unenrolled students are forbidden.
      // Owner-instructors bypass enrollment; admins bypass everything.
      if (user.roles.includes('instructor') || user.roles.includes('student')) {
        next(forbidden('Enrollment required'));
        return;
      }
      next(forbidden('Enrollment required'));
      return;
    }
    const rows = await db.query(
      `SELECT id, course_id, instructor_id, title, description, due_at, max_score, created_at FROM assignments WHERE course_id = $1 ORDER BY created_at`,
      [course.id],
    );
    res.json({ data: rows.rows });
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/assignments/:id', authenticate, async (req, res, next) => {
  try {
    const access = await requireAssignmentAccess(req.params.id, { id: req.user!.id, roles: req.user!.roles });
    if ('error' in access) {
      next(notFound('Assignment not found'));
      return;
    }
    const a = access.assignment as { course_id: string; instructor_id: string };
    const courseRes = await db.query(`SELECT instructor_id FROM courses WHERE id = $1`, [a.course_id]);
    const courseInstructor = ((courseRes.rows[0] as { instructor_id: string } | undefined)?.instructor_id ?? '') as string;
    const user = req.user!;
    const isAdmin = user.roles.includes('admin');
    const isOwner = canGradeAssignment(a.instructor_id, courseInstructor, { id: user.id, roles: user.roles });
    const enrolled = !isAdmin && !isOwner ? await isEnrolled(user.id, a.course_id) : true;
    if (!isAdmin && !isOwner && !enrolled) {
      next(forbidden('Enrollment required'));
      return;
    }
    const row = await db.query(
      `SELECT id, course_id, instructor_id, title, description, due_at, max_score, created_at FROM assignments WHERE id = $1`,
      [req.params.id],
    );
    res.json(row.rows[0]);
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/assignments/:id/my-submission', authenticate, authorize('student', 'admin'), async (req, res, next) => {
  try {
    const access = await requireAssignmentAccess(req.params.id, { id: req.user!.id, roles: req.user!.roles });
    if ('error' in access) {
      next(notFound('Assignment not found'));
      return;
    }
    const assignment = access.assignment as { course_id: string };
    if (!req.user!.roles.includes('admin') && !(await isEnrolled(req.user!.id, assignment.course_id))) {
      next(forbidden('Enrollment required'));
      return;
    }
    const row = await db.query(
      `SELECT id, assignment_id, student_id, file_key, file_name, file_size_bytes, mime_type, content_text, grade, feedback, submitted_at, graded_at FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2`,
      [req.params.id, req.user!.id],
    );
    const found = row.rows[0] as Record<string, unknown> | undefined;
    if (!found) {
      next(notFound('Submission not found'));
      return;
    }
    res.json(found);
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/assignments/:id/submissions', authenticate, authorize('instructor', 'admin'), async (req, res, next) => {
  try {
    const access = await requireAssignmentAccess(req.params.id, { id: req.user!.id, roles: req.user!.roles });
    if ('error' in access) {
      next(notFound('Assignment not found'));
      return;
    }
    const a = access.assignment as { instructor_id: string; course_id: string };
    const courseRes = await db.query(`SELECT instructor_id FROM courses WHERE id = $1`, [a.course_id]);
    const courseInstructor = ((courseRes.rows[0] as { instructor_id: string } | undefined)?.instructor_id ?? '') as string;
    if (!canGradeAssignment(a.instructor_id, courseInstructor, { id: req.user!.id, roles: req.user!.roles })) {
      next(forbidden('You do not own this assignment'));
      return;
    }
    const rows = await db.query(
      `SELECT s.id, s.assignment_id, s.student_id, s.file_key, s.file_name, s.file_size_bytes, s.mime_type, s.content_text, s.grade, s.feedback, s.submitted_at, s.graded_at, u.email AS student_email, u.name AS student_name
       FROM assignment_submissions s JOIN users u ON u.id = s.student_id WHERE s.assignment_id = $1 ORDER BY s.submitted_at`,
      [req.params.id],
    );
    res.json({ data: rows.rows });
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/courses/:id/quizzes', authenticate, async (req, res, next) => {
  try {
    const courseRes = await db.query(`SELECT id, instructor_id FROM courses WHERE id = $1`, [req.params.id]);
    const course = courseRes.rows[0] as { id: string; instructor_id: string } | undefined;
    if (!course) {
      next(notFound('Course not found'));
      return;
    }
    const user = req.user!;
    const isAdmin = user.roles.includes('admin');
    const isOwner = course.instructor_id === user.id;
    const enrolled = !isAdmin && !isOwner ? await isEnrolled(user.id, course.id) : true;
    if (!isAdmin && !isOwner && !enrolled) {
      next(forbidden('Enrollment required'));
      return;
    }
    const rows = await db.query(
      `SELECT q.id, q.course_id, q.title, q.description, q.is_ai_generated, q.created_at, COUNT(qq.id)::int AS question_count
       FROM quizzes q LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id WHERE q.course_id = $1 GROUP BY q.id, q.course_id, q.title, q.description, q.is_ai_generated, q.created_at ORDER BY q.created_at`,
      [course.id],
    );
    res.json({ data: rows.rows });
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/quizzes/:id', authenticate, async (req, res, next) => {
  try {
    const quizRes = await db.query(`SELECT id, course_id, instructor_id, title, description, is_ai_generated, created_at FROM quizzes WHERE id = $1`, [req.params.id]);
    const quiz = quizRes.rows[0] as
      | { id: string; course_id: string; instructor_id: string; title: string; description: string; is_ai_generated: boolean; created_at: string }
      | undefined;
    if (!quiz) {
      next(notFound('Quiz not found'));
      return;
    }
    const courseRes = await db.query(`SELECT instructor_id FROM courses WHERE id = $1`, [quiz.course_id]);
    const courseInstructor = ((courseRes.rows[0] as { instructor_id: string } | undefined)?.instructor_id ?? '') as string;
    const user = req.user!;
    const isAdmin = user.roles.includes('admin');
    const isOwner = user.id === quiz.instructor_id || user.id === courseInstructor;
    const enrolled = !isAdmin && !isOwner ? await isEnrolled(user.id, quiz.course_id) : true;
    if (!isAdmin && !isOwner && !enrolled) {
      next(forbidden('Enrollment required'));
      return;
    }
    const qRes = await db.query(`SELECT id, type, prompt, points FROM quiz_questions WHERE quiz_id = $1 ORDER BY created_at`, [quiz.id]);
    const questions: Record<string, unknown>[] = [];
    for (const q of qRes.rows as { id: string; type: string; prompt: string; points: number }[]) {
      if (isAdmin || isOwner) {
        const oRes = await db.query(`SELECT id, option_text, is_correct, sort_order FROM quiz_options WHERE question_id = $1 ORDER BY sort_order`, [q.id]);
        questions.push({ id: q.id, type: q.type, prompt: q.prompt, points: q.points, options: oRes.rows });
      } else {
        const oRes = await db.query(`SELECT id, option_text FROM quiz_options WHERE question_id = $1 ORDER BY sort_order`, [q.id]);
        questions.push({ id: q.id, type: q.type, prompt: q.prompt, points: q.points, options: oRes.rows });
      }
    }
    res.json({ ...quiz, questions });
  } catch (err) {
    next(err);
  }
});

learningRouter.post('/assignments', authenticate, authorize('instructor', 'admin'), validateBody(assignmentCreateSchema), async (req, res, next) => {
  try {
    const body = req.body as { courseId: string; title: string; description: string; dueAt?: string; maxScore: number };
    const courseRes = await db.query(`SELECT id, instructor_id FROM courses WHERE id = $1`, [body.courseId]);
    const course = courseRes.rows[0] as { id: string; instructor_id: string } | undefined;
    if (!course) {
      next(notFound('Course not found'));
      return;
    }
    if (!req.user!.roles.includes('admin') && course.instructor_id !== req.user!.id) {
      next(forbidden('You do not own this course'));
      return;
    }
    const id = newId();
    await db.query(
      `INSERT INTO assignments (id, course_id, instructor_id, title, description, due_at, max_score) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, body.courseId, req.user!.id, body.title, body.description ?? '', body.dueAt ?? null, body.maxScore],
    );
    const created = await db.query(`SELECT id, course_id, instructor_id, title, description, due_at, max_score, created_at FROM assignments WHERE id = $1`, [id]);
    res.status(201).json(created.rows[0]);
  } catch (err) {
    next(err);
  }
});

learningRouter.put('/assignments/:id', authenticate, authorize('instructor', 'admin'), validateBody(assignmentUpdateSchema), async (req, res, next) => {
  try {
    const access = await requireAssignmentAccess(req.params.id, { id: req.user!.id, roles: req.user!.roles });
    if ('error' in access) {
      next(notFound('Assignment not found'));
      return;
    }
    const a = access.assignment as { instructor_id: string; course_id: string };
    const courseRes = await db.query(`SELECT instructor_id FROM courses WHERE id = $1`, [a.course_id]);
    const courseInstructor = ((courseRes.rows[0] as { instructor_id: string } | undefined)?.instructor_id ?? '') as string;
    if (!canGradeAssignment(a.instructor_id, courseInstructor, { id: req.user!.id, roles: req.user!.roles })) {
      next(forbidden('You do not own this assignment'));
      return;
    }
    const patch = req.body as { title?: string; description?: string; dueAt?: string | null; maxScore?: number };
    await db.query(
      `UPDATE assignments SET title = COALESCE($2, title), description = COALESCE($3, description), due_at = $4, max_score = COALESCE($5, max_score), updated_at = now() WHERE id = $1`,
      [req.params.id, patch.title ?? null, patch.description ?? null, patch.dueAt === undefined ? undefined as unknown as null : patch.dueAt, patch.maxScore ?? null],
    );
    const updated = await db.query(`SELECT id, course_id, instructor_id, title, description, due_at, max_score, created_at FROM assignments WHERE id = $1`, [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

learningRouter.post('/assignments/:id/submit', authenticate, authorize('student', 'admin'), validateBody(submitSchema), async (req, res, next) => {
  try {
    const access = await requireAssignmentAccess(req.params.id, { id: req.user!.id, roles: req.user!.roles });
    if ('error' in access) {
      next(notFound('Assignment not found'));
      return;
    }
    const assignment = access.assignment as { course_id: string; due_at: string | null; max_score: number };
    if (!req.user!.roles.includes('admin') && !(await isEnrolled(req.user!.id, assignment.course_id))) {
      next(forbidden('Enrollment required'));
      return;
    }
    if (assignment.due_at && new Date(assignment.due_at).getTime() < Date.now()) {
      next(forbidden('Submission deadline has passed'));
      return;
    }
    const body = req.body as { fileName?: string; fileSizeBytes?: number; mimeType?: string; contentText: string };
    const existing = await db.query(`SELECT id FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2`, [req.params.id, req.user!.id]);
    if (existing.rowCount) {
      next(conflict('Already submitted'));
      return;
    }
    const submissionId = newId();
    const target = await buildSubmissionUploadTarget(req.params.id, submissionId, body.fileName ?? 'submission.txt');
    await db.query(
      `INSERT INTO assignment_submissions (id, assignment_id, student_id, file_key, file_name, file_size_bytes, mime_type, content_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [submissionId, req.params.id, req.user!.id, target.key, body.fileName ?? null, body.fileSizeBytes ?? null, body.mimeType ?? null, body.contentText ?? ''],
    );
    await touchStreak(req.user!.id);
    const created = await db.query(
      `SELECT id, assignment_id, student_id, file_key, file_name, file_size_bytes, mime_type, submitted_at FROM assignment_submissions WHERE id = $1`,
      [submissionId],
    );
    res.status(201).json({ ...(created.rows[0] as object), storage: { bucket: target.bucket, key: target.key, uploadUrl: target.uploadUrl } });
  } catch (err) {
    next(err);
  }
});

learningRouter.put('/submissions/:id/grade', authenticate, authorize('instructor', 'admin'), validateBody(gradeSchema), async (req, res, next) => {
  try {
    const subRes = await db.query(
      `SELECT s.id, s.assignment_id, s.student_id, s.grade, a.instructor_id, a.course_id, a.max_score, c.instructor_id AS course_instructor
       FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id JOIN courses c ON c.id = a.course_id WHERE s.id = $1`,
      [req.params.id],
    );
    const sub = subRes.rows[0] as
      | { id: string; assignment_id: string; student_id: string; instructor_id: string; course_id: string; max_score: number; course_instructor: string }
      | undefined;
    if (!sub) {
      next(notFound('Submission not found'));
      return;
    }
    if (!canGradeAssignment(sub.instructor_id, sub.course_instructor, { id: req.user!.id, roles: req.user!.roles })) {
      next(forbidden('You do not own this assignment'));
      return;
    }
    const body = req.body as { grade: number; feedback: string };
    if (body.grade > sub.max_score) {
      next(conflict(`Grade exceeds max score of ${sub.max_score}`));
      return;
    }
    await db.query(`UPDATE assignment_submissions SET grade = $1, feedback = $2, graded_at = now(), graded_by = $3, updated_at = now() WHERE id = $4`, [
      body.grade,
      body.feedback ?? '',
      req.user!.id,
      req.params.id,
    ]);
    await createNotification({
      userId: sub.student_id,
      type: 'assignment_graded',
      title: `Assignment graded: ${body.grade}/${sub.max_score}`,
      body: body.feedback ?? '',
      link: `/assignments/${sub.assignment_id}`,
    });
    const updated = await db.query(`SELECT id, assignment_id, student_id, grade, feedback, graded_at FROM assignment_submissions WHERE id = $1`, [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

learningRouter.post('/quizzes', authenticate, authorize('instructor', 'admin'), validateBody(quizCreateSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof quizCreateSchema>;
    const courseRes = await db.query(`SELECT id, instructor_id FROM courses WHERE id = $1`, [body.courseId]);
    const course = courseRes.rows[0] as { id: string; instructor_id: string } | undefined;
    if (!course) {
      next(notFound('Course not found'));
      return;
    }
    if (!req.user!.roles.includes('admin') && course.instructor_id !== req.user!.id) {
      next(forbidden('You do not own this course'));
      return;
    }
    for (const q of body.questions) {
      if ((q.type === 'mcq' || q.type === 'multi_select') && (!q.options || q.options.length < 2)) {
        next(conflict('Objective questions require at least 2 options'));
        return;
      }
      if ((q.type === 'mcq' || q.type === 'multi_select') && q.options && !q.options.some((o) => o.isCorrect)) {
        next(conflict('Objective questions require at least one correct option'));
        return;
      }
    }
    const quizId = newId();
    await db.query(`INSERT INTO quizzes (id, course_id, instructor_id, title, description, is_ai_generated) VALUES ($1, $2, $3, $4, $5, false)`, [
      quizId,
      body.courseId,
      req.user!.id,
      body.title,
      body.description ?? '',
    ]);
    const createdQuestions: Record<string, unknown>[] = [];
    for (const q of body.questions) {
      const questionId = newId();
      await db.query(`INSERT INTO quiz_questions (id, quiz_id, type, prompt, points) VALUES ($1, $2, $3, $4, $5)`, [
        questionId,
        quizId,
        q.type,
        q.prompt,
        q.points,
      ]);
      const opts: Record<string, unknown>[] = [];
      if (q.options) {
        let order = 0;
        for (const o of q.options) {
          const optionId = newId();
          await db.query(`INSERT INTO quiz_options (id, question_id, option_text, is_correct, sort_order) VALUES ($1, $2, $3, $4, $5)`, [
            optionId,
            questionId,
            o.text,
            o.isCorrect,
            order++,
          ]);
          opts.push({ id: optionId, text: o.text, isCorrect: o.isCorrect });
        }
      }
      createdQuestions.push({ id: questionId, type: q.type, prompt: q.prompt, points: q.points, options: opts });
    }
    res.status(201).json({ id: quizId, courseId: body.courseId, title: body.title, questions: createdQuestions });
  } catch (err) {
    next(err);
  }
});

learningRouter.post('/quizzes/:id/attempt', authenticate, authorize('student', 'admin'), async (req, res, next) => {
  try {
    const quizRes = await db.query(`SELECT id, course_id FROM quizzes WHERE id = $1`, [req.params.id]);
    const quiz = quizRes.rows[0] as { id: string; course_id: string } | undefined;
    if (!quiz) {
      next(notFound('Quiz not found'));
      return;
    }
    if (!req.user!.roles.includes('admin') && !(await isEnrolled(req.user!.id, quiz.course_id))) {
      next(forbidden('Enrollment required'));
      return;
    }
    const id = newId();
    await db.query(`INSERT INTO quiz_attempts (id, quiz_id, student_id, status) VALUES ($1, $2, $3, 'in_progress')`, [id, quiz.id, req.user!.id]);
    await touchStreak(req.user!.id);
    const created = await db.query(`SELECT id, quiz_id, student_id, status, started_at FROM quiz_attempts WHERE id = $1`, [id]);
    const qRes = await db.query(`SELECT id, type, prompt, points FROM quiz_questions WHERE quiz_id = $1 ORDER BY created_at`, [quiz.id]);
    const questions: Record<string, unknown>[] = [];
    for (const q of qRes.rows as { id: string; type: string; prompt: string; points: number }[]) {
      const oRes = await db.query(`SELECT id, option_text FROM quiz_options WHERE question_id = $1 ORDER BY sort_order`, [q.id]);
      questions.push({ id: q.id, type: q.type, prompt: q.prompt, points: q.points, options: oRes.rows });
    }
    res.status(201).json({ ...(created.rows[0] as object), questions });
  } catch (err) {
    next(err);
  }
});

learningRouter.post('/attempts/:id/submit', authenticate, authorize('student', 'admin'), validateBody(attemptSubmitSchema), async (req, res, next) => {
  try {
    const attemptRes = await db.query(`SELECT id, quiz_id, student_id, status FROM quiz_attempts WHERE id = $1`, [req.params.id]);
    const attempt = attemptRes.rows[0] as { id: string; quiz_id: string; student_id: string; status: string } | undefined;
    if (!attempt) {
      next(notFound('Attempt not found'));
      return;
    }
    if (attempt.student_id !== req.user!.id && !req.user!.roles.includes('admin')) {
      next(forbidden('You do not own this attempt'));
      return;
    }
    if (attempt.status !== 'in_progress') {
      next(conflict('Attempt already submitted'));
      return;
    }
    const body = req.body as z.infer<typeof attemptSubmitSchema>;
    const qRes = await db.query(`SELECT id, type, points FROM quiz_questions WHERE quiz_id = $1`, [attempt.quiz_id]);
    const byId = new Map((qRes.rows as { id: string; type: string; points: number }[]).map((q) => [q.id, q]));
    let earned = 0;
    let max = 0;
    let hasShortAnswer = false;
    for (const q of byId.values()) max += q.points;
    for (const a of body.answers) {
      const meta = byId.get(a.questionId);
      if (!meta) {
        next(notFound(`Question ${a.questionId} not part of this quiz`));
        return;
      }
      if (meta.type === 'short_answer') hasShortAnswer = true;
      const optRes = await db.query(`SELECT id FROM quiz_options WHERE question_id = $1 AND is_correct = true`, [a.questionId]);
      const correctIds = (optRes.rows as { id: string }[]).map((r) => r.id);
      const graded = gradeObjectiveQuestion({
        type: meta.type as 'mcq' | 'multi_select' | 'short_answer',
        correctOptionIds: correctIds,
        points: meta.points,
        selectedOptionIds: a.selectedOptionIds,
        answerText: a.answerText,
      });
      earned += graded.pointsEarned;
      await db.query(
        `INSERT INTO quiz_answers (id, attempt_id, question_id, selected_option_ids, answer_text, is_correct, points_earned)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [newId(), attempt.id, a.questionId, JSON.stringify(a.selectedOptionIds), a.answerText ?? '', graded.isCorrect, graded.pointsEarned],
      );
    }
    const status = hasShortAnswer ? 'submitted' : 'graded';
    await db.query(`UPDATE quiz_attempts SET status = $1, score = $2, max_score = $3, submitted_at = now() WHERE id = $4`, [status, earned, max, attempt.id]);
    if (!hasShortAnswer && max > 0 && earned === max) {
      await awardBadge(req.user!.id, 'perfect-quiz-score', { quiz_id: attempt.quiz_id, attempt_id: attempt.id });
    }
    const updated = await db.query(`SELECT id, quiz_id, student_id, status, score, max_score, submitted_at FROM quiz_attempts WHERE id = $1`, [attempt.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/certificates/me', authenticate, authorize('student', 'admin'), async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT c.id, c.course_id, c.certificate_code, c.pdf_key, c.issued_at, co.title AS course_title FROM certificates c JOIN courses co ON co.id = c.course_id WHERE c.user_id = $1 ORDER BY c.issued_at DESC`,
      [req.user!.id],
    );
    res.json({ data: rows.rows });
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/certificates/:id/download', authenticate, async (req, res, next) => {
  try {
    const certRes = await db.query(
      `SELECT cert.id, cert.user_id, cert.course_id, cert.certificate_code, cert.pdf_key, cert.issued_at, u.name AS student_name, co.title AS course_title
       FROM certificates cert JOIN users u ON u.id = cert.user_id JOIN courses co ON co.id = cert.course_id WHERE cert.id = $1`,
      [req.params.id],
    );
    const cert = certRes.rows[0] as
      | { id: string; user_id: string; certificate_code: string; pdf_key: string | null; issued_at: string; student_name: string; course_title: string }
      | undefined;
    if (!cert) {
      next(notFound('Certificate not found'));
      return;
    }
    if (cert.user_id !== req.user!.id && !req.user!.roles.includes('admin')) {
      next(forbidden('You do not own this certificate'));
      return;
    }
    // Prefer the stored artifact (S3/MinIO or local); fall back to
    // re-rendering so downloads keep working if storage was wiped.
    let pdf: Buffer | null = null;
    if (cert.pdf_key) {
      try {
        const { readBytes } = await import('../storage/objectStore');
        const { bucketFor } = await import('../storage/objectStore');
        pdf = (await readBytes(bucketFor('certificates'), cert.pdf_key)).bytes;
      } catch {
        pdf = null;
      }
    }
    if (!pdf) {
      const { renderCertificatePdf } = await import('./certificates');
      pdf = Buffer.from(
        await renderCertificatePdf({
          name: cert.student_name,
          courseTitle: cert.course_title,
          code: cert.certificate_code,
          issuedAt: new Date(cert.issued_at).toISOString().slice(0, 10),
        }),
      );
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${cert.certificate_code}.pdf"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

learningRouter.get('/gamification/me', authenticate, async (req, res, next) => {
  try {
    const badgesRes = await db.query(
      `SELECT b.slug, b.name, b.description, ub.awarded_at FROM user_badges ub JOIN badges b ON b.id = ub.badge_id WHERE ub.user_id = $1 ORDER BY ub.awarded_at`,
      [req.user!.id],
    );
    const streakRes = await db.query(`SELECT current_streak_days, longest_streak_days, last_activity_date FROM streaks WHERE user_id = $1`, [req.user!.id]);
    res.json({ badges: badgesRes.rows, streak: (streakRes.rows[0] as Record<string, unknown> | undefined) ?? null });
  } catch (err) {
    next(err);
  }
});

/**
 * Phase 7 public leaderboard (streak-based aggregates only — no PII beyond
 * display names). Redis-cached per PRD with TTL + x-cache header. This is the
 * minimum leaderboard surface the PRD caching requirement expects; it is
 * derived from existing streaks/badges data (no new product scope).
 */
learningRouter.get('/gamification/leaderboard', async (req, res, next) => {
  try {
    const { CACHE_TTL, cacheGet, cacheSet, leaderboardCacheKey } = await import('../cache/courseCache');
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10) || 10));
    const key = leaderboardCacheKey(limit);
    const cached = await cacheGet<{ data: unknown[] }>(key);
    if (cached.hit && cached.value) {
      res.setHeader('x-cache', 'HIT');
      res.json(cached.value);
      return;
    }
    let rows: Record<string, unknown>[];
    try {
      const out = await db.query(
        `SELECT u.name AS name, COALESCE(s.current_streak_days, 0)::int AS streak,
                COALESCE((SELECT COUNT(*)::int FROM user_badges ub WHERE ub.user_id = u.id), 0) AS badges
         FROM users u LEFT JOIN streaks s ON s.user_id = u.id
         ORDER BY streak DESC, badges DESC LIMIT $1`,
        [limit],
      );
      rows = out.rows;
    } catch {
      rows = [];
    }
    const body = { data: rows };
    await cacheSet(key, body, CACHE_TTL.leaderboard);
    res.setHeader('x-cache', 'MISS');
    res.json(body);
  } catch (err) {
    next(err);
  }
});

learningRouter.get(
  '/courses/:id/analytics',
  authenticate,
  authorize('instructor', 'admin'),
  requireCourseOwner,
  async (req, res, next) => {
    try {
      const enrolledRes = await db.query(`SELECT COUNT(*)::int AS count FROM enrollments WHERE course_id = $1`, [req.params.id]);
      const enrolled = (enrolledRes.rows[0] as { count: number }).count;
      const lecturesRes = await db.query(
        `SELECT l.id, l.title FROM lectures l JOIN modules m ON m.id = l.module_id WHERE m.course_id = $1 ORDER BY l.sort_order`,
        [req.params.id],
      );
      const quizRes = await db.query(
        `SELECT q.id AS quiz_id, q.title, COALESCE(AVG(a.score), 0)::float AS avg_score, COALESCE(AVG(a.max_score), 0)::float AS avg_max_score, COUNT(a.id)::int AS attempts
         FROM quizzes q LEFT JOIN quiz_attempts a ON a.quiz_id = q.id AND a.status IN ('submitted', 'graded') WHERE q.course_id = $1 GROUP BY q.id, q.title`,
        [req.params.id],
      );
      const timeRes = await db.query(
        `SELECT COALESCE(SUM(lp.watched_seconds), 0)::int AS total_watched_seconds, COUNT(DISTINCT lp.user_id)::int AS active_students
         FROM lecture_progress lp JOIN lectures l ON l.id = lp.lecture_id JOIN modules m ON m.id = l.module_id WHERE m.course_id = $1`,
        [req.params.id],
      );
      const perLecture: Record<string, unknown>[] = [];
      for (const r of lecturesRes.rows as { id: string; title: string }[]) {
        const doneRes = await db.query(`SELECT COUNT(*)::int AS count FROM lecture_progress WHERE lecture_id = $1 AND completed = true`, [r.id]);
        const avgRes = await db.query(`SELECT COALESCE(AVG(watched_seconds), 0)::float AS avg FROM lecture_progress WHERE lecture_id = $1`, [r.id]);
        const completed = (doneRes.rows[0] as { count: number }).count;
        const avg = (avgRes.rows[0] as { avg: number }).avg;
        perLecture.push({
          lectureId: r.id,
          title: r.title,
          enrolled,
          completed,
          dropOffRate: enrolled ? 1 - completed / enrolled : 0,
          avgWatchedSeconds: avg,
        });
      }
      res.json({
        perLecture,
        quizzes: quizRes.rows,
        timeOnTask: timeRes.rows[0],
      });
    } catch (err) {
      next(err);
    }
  },
);

export function courseStatusUpdateHook(): Router {
  const r = Router();
  r.patch('/courses/:id/status', authenticate, authorize('admin'), async (req, res, next) => {
    try {
      const schema = z.object({ status: z.enum(['draft', 'pending', 'published', 'rejected']) });
      const { status } = schema.parse(req.body);
      const existing = await db.query(`SELECT id FROM courses WHERE id = $1`, [req.params.id]);
      if (!existing.rowCount) {
        next(notFound('Course not found'));
        return;
      }
      await db.query(`UPDATE courses SET status = $1, updated_at = now() WHERE id = $2`, [status, req.params.id]);
      const updated = await db.query(`SELECT id, title, description, status, instructor_id FROM courses WHERE id = $1`, [req.params.id]);
      res.json(updated.rows[0]);
    } catch (err) {
      next(err);
    }
  });
  return r;
}

export { normalizeIdList };
