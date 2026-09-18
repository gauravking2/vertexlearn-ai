import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate, authorize } from '../auth/middleware';
import { db, newId } from '../db/pool';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { validateBody } from '../middleware/validate';
import { getLectureCourse, isEnrolled, requireAssignmentAccess } from '../learning/guards';
import { touchStreak } from '../learning/progress';
import {
  bucketFor,
  buildDownloadUrl,
  buildLectureUploadTarget,
  readBytes,
  sanitizeFileName,
  storeBytes,
  storedObjectExists,
  submissionObjectKey,
} from './objectStore';
import { getConfig } from '../config';

export const storageRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  // Multer-level ceiling; the configured UPLOAD_MAX_MB limit is enforced in-handler.
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
});

function maxUploadBytes(): number {
  try {
    return getConfig().UPLOAD_MAX_MB * 1024 * 1024;
  } catch {
    return 25 * 1024 * 1024;
  }
}

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.zip',
  '.txt', '.md', '.csv', '.json',
  '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.c', '.h', '.cpp', '.hpp', '.go', '.rs', '.rb', '.php',
]);

function extOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i >= 0 ? fileName.slice(i).toLowerCase() : '';
}

function sniffKind(buf: Buffer): 'pdf' | 'zip' | 'unknown' {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'zip';
  return 'unknown';
}

/**
 * Binary assignment upload (PRD file-upload requirement).
 * multipart/form-data with a single `file` field. Metadata is stored in
 * Postgres; bytes go to S3/MinIO (or the local dev fallback) — never into
 * the database. The existing JSON text submission is preserved untouched.
 */
storageRouter.post(
  '/assignments/:id/upload',
  authenticate,
  authorize('student', 'admin'),
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        next(badRequest(err instanceof Error ? err.message : 'File upload failed'));
        return;
      }
      next();
    });
  },
  async (req, res, next) => {
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
      const file = (req as unknown as { file?: Express.Multer.File }).file;
      if (!file || !file.buffer || file.buffer.length === 0) {
        next(badRequest('A non-empty `file` field is required'));
        return;
      }
      if (file.buffer.length > maxUploadBytes()) {
        next(badRequest(`File exceeds the ${getConfig().UPLOAD_MAX_MB}MB limit`));
        return;
      }
      const originalName = file.originalname || 'submission';
      const ext = extOf(originalName);
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        next(badRequest(`File type ${ext || '(none)'} is not accepted. Allowed: PDF, ZIP, and code/text files.`));
        return;
      }
      // Magic-byte cross-check for the two binary formats (extension spoofing guard).
      const sniffed = sniffKind(file.buffer);
      if ((ext === '.pdf' && sniffed !== 'pdf') || (ext === '.zip' && sniffed !== 'zip')) {
        next(badRequest('File content does not match its extension'));
        return;
      }
      const existing = await db.query(`SELECT id FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2`, [
        req.params.id,
        req.user!.id,
      ]);
      if (existing.rowCount) {
        next(conflict('Already submitted'));
        return;
      }
      const submissionId = newId();
      const safeName = sanitizeFileName(originalName, 'submission');
      const key = submissionObjectKey(req.params.id, submissionId, safeName);
      const bucket = bucketFor('submissions');
      const contentType = file.mimetype || (ext === '.pdf' ? 'application/pdf' : ext === '.zip' ? 'application/zip' : 'application/octet-stream');
      const stored = await storeBytes(bucket, key, file.buffer, contentType);
      await db.query(
        `INSERT INTO assignment_submissions (id, assignment_id, student_id, file_key, file_name, file_size_bytes, mime_type, content_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '')`,
        [submissionId, req.params.id, req.user!.id, key, safeName, file.buffer.length, contentType],
      );
      await touchStreak(req.user!.id);
      const created = await db.query(
        `SELECT id, assignment_id, student_id, file_key, file_name, file_size_bytes, mime_type, submitted_at FROM assignment_submissions WHERE id = $1`,
        [submissionId],
      );
      res.status(201).json({ ...(created.rows[0] as object), storage: { backend: stored.backend, bucket, key } });
    } catch (err) {
      next(err);
    }
  },
);

/** Download a submission's bytes. Authz enforced here; objects stay private (no public bucket access). */
storageRouter.get('/submissions/:id/download', authenticate, async (req, res, next) => {
  try {
    const subRes = await db.query(
      `SELECT s.id, s.assignment_id, s.student_id, s.file_key, s.file_name, s.mime_type, a.course_id, a.instructor_id, c.instructor_id AS course_instructor
       FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id JOIN courses c ON c.id = a.course_id WHERE s.id = $1`,
      [req.params.id],
    );
    const sub = subRes.rows[0] as
      | { id: string; student_id: string; file_key: string | null; file_name: string | null; mime_type: string | null; instructor_id: string; course_instructor: string }
      | undefined;
    if (!sub) {
      next(notFound('Submission not found'));
      return;
    }
    const user = req.user!;
    const isOwner = sub.student_id === user.id;
    const isGrader = user.roles.includes('admin') || sub.instructor_id === user.id || sub.course_instructor === user.id;
    if (!isOwner && !isGrader) {
      next(forbidden('You cannot access this submission'));
      return;
    }
    if (!sub.file_key) {
      next(notFound('This submission has no file attached'));
      return;
    }
    const bucket = bucketFor('submissions');
    let data;
    try {
      data = await readBytes(bucket, sub.file_key);
    } catch {
      next(notFound('Stored file is unavailable'));
      return;
    }
    res.setHeader('Content-Type', data.contentType || sub.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${(sub.file_name || 'submission').replace(/"/g, '')}"`);
    res.send(data.bytes);
  } catch (err) {
    next(err);
  }
});

const lectureUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().max(127).default('video/mp4'),
});

const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'application/octet-stream']);

/** Instructor requests a presigned PUT for a lecture asset. Ownership enforced; no credentials leave the backend. */
storageRouter.post('/lectures/:id/upload-url', authenticate, authorize('instructor', 'admin'), validateBody(lectureUploadSchema), async (req, res, next) => {
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
    const body = req.body as z.infer<typeof lectureUploadSchema>;
    if (!ALLOWED_VIDEO_TYPES.has(body.contentType)) {
      next(badRequest('Unsupported video content type'));
      return;
    }
    const target = await buildLectureUploadTarget(req.params.id, body.fileName, body.contentType);
    await db.query(`UPDATE lectures SET video_key = $1, updated_at = now() WHERE id = $2`, [target.key, req.params.id]);
    res.status(201).json({ lectureId: req.params.id, ...target });
  } catch (err) {
    next(err);
  }
});

/**
 * Access-checked playback URL. Returns a short-lived signed URL when object
 * storage backs the asset (explicitly a local-development implementation —
 * production HLS/CDN is out of scope), or 404 with an honest message when no
 * video is attached.
 */
storageRouter.get('/lectures/:id/video-url', authenticate, async (req, res, next) => {
  try {
    const ref = await getLectureCourse(req.params.id);
    if (!ref) {
      next(notFound('Lecture not found'));
      return;
    }
    const user = req.user!;
    const isAdmin = user.roles.includes('admin');
    const isOwner = ref.instructorId === user.id;
    if (!isAdmin && !isOwner && !(await isEnrolled(user.id, ref.courseId))) {
      next(forbidden('Enrollment required'));
      return;
    }
    const lec = await db.query(`SELECT video_key FROM lectures WHERE id = $1`, [req.params.id]);
    const videoKey = (lec.rows[0] as { video_key: string | null } | undefined)?.video_key;
    if (!videoKey) {
      next(notFound('No video is attached to this lecture yet'));
      return;
    }
    const bucket = bucketFor('videos');
    const url = await buildDownloadUrl(bucket, videoKey, 900);
    if (!url) {
      // No S3 backend: report honestly instead of fabricating a stream.
      const exists = await storedObjectExists(bucket, videoKey);
      res.json({ lectureId: req.params.id, url: null, expiresInSeconds: 0, unavailable: true, reason: exists ? 'Object storage is not configured for streaming' : 'Stored video file is missing' });
      return;
    }
    res.json({ lectureId: req.params.id, url, expiresInSeconds: 900 });
  } catch (err) {
    next(err);
  }
});
