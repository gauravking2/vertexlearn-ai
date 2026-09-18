import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { db, newId } from '../db/pool';
import { bucketFor, certificateObjectKey, readBytes, storeBytes } from '../storage/objectStore';
import { awardBadge, certificateCode } from './progress';
import { createNotification } from '../notifications/service';

export interface CertificateIssueResult {
  certificate: Record<string, unknown>;
  created: boolean;
}

export async function issueCertificateIfComplete(userId: string, courseId: string): Promise<CertificateIssueResult | null> {
  const enr = await db.query(`SELECT progress_percent, completed_at FROM enrollments WHERE user_id = $1 AND course_id = $2`, [userId, courseId]);
  const row = enr.rows[0] as { progress_percent: number; completed_at: string | null } | undefined;
  if (!row || !(row.completed_at || row.progress_percent >= 100)) return null;

  const existing = await db.query(`SELECT id, user_id, course_id, certificate_code, pdf_key, issued_at FROM certificates WHERE user_id = $1 AND course_id = $2`, [
    userId,
    courseId,
  ]);
  if (existing.rowCount) {
    return { certificate: existing.rows[0] as Record<string, unknown>, created: false };
  }

  const userRes = await db.query(`SELECT name, email FROM users WHERE id = $1`, [userId]);
  const courseRes = await db.query(`SELECT title FROM courses WHERE id = $1`, [courseId]);
  const user = (userRes.rows[0] ?? {}) as { name?: string; email?: string };
  const course = (courseRes.rows[0] ?? {}) as { title?: string };
  const code = certificateCode();
  const pdfBytes = await renderCertificatePdf({
    name: user.name ?? user.email ?? 'Student',
    courseTitle: course.title ?? 'Course',
    code,
    issuedAt: new Date().toISOString().slice(0, 10),
  });
  const key = certificateObjectKey(userId, courseId);
  // Certificate artifacts flow through the storage abstraction: S3/MinIO
  // when configured, local disk otherwise. pdf_key stores the logical key.
  try {
    await storeBytes(bucketFor('certificates'), key, Buffer.from(pdfBytes), 'application/pdf');
  } catch {
    // Storage failure must not block issuance; the PDF is re-rendered on download.
  }
  const id = newId();
  await db.query(
    `INSERT INTO certificates (id, user_id, course_id, certificate_code, pdf_key) VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, courseId, code, key],
  );
  const created = await db.query(`SELECT id, user_id, course_id, certificate_code, pdf_key, issued_at FROM certificates WHERE id = $1`, [id]);
  const completedCourses = await db.query(`SELECT COUNT(*)::int AS count FROM enrollments WHERE user_id = $1 AND completed_at IS NOT NULL`, [userId]);
  if (((completedCourses.rows[0] as { count: number }).count ?? 0) >= 1) {
    await awardBadge(userId, 'first-course-completed', { course_id: courseId });
  }
  await createNotification({
    userId,
    type: 'certificate_issued',
    title: `Certificate issued: ${course.title ?? 'Course'}`,
    body: `Code ${code}`,
    link: `/certificates`,
  });
  return { certificate: created.rows[0] as Record<string, unknown>, created: true };
}

export async function renderCertificatePdf(input: { name: string; courseTitle: string; code: string; issuedAt: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([792, 612]);
  const { width, height } = page.getSize();
  const titleFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: rgb(0.12, 0.23, 0.47), borderWidth: 3 });
  page.drawText('VertexLearn AI — Certificate of Completion', {
    x: 90,
    y: height - 150,
    size: 26,
    font: titleFont,
    color: rgb(0.12, 0.23, 0.47),
  });
  page.drawText(`Awarded to: ${input.name}`, { x: 90, y: height - 210, size: 16, font: bodyFont });
  page.drawText(`Course: ${input.courseTitle}`, { x: 90, y: height - 240, size: 16, font: bodyFont });
  page.drawText(`Issued: ${input.issuedAt}`, { x: 90, y: height - 270, size: 12, font: bodyFont });
  page.drawText(`Code: ${input.code}`, { x: 90, y: height - 292, size: 12, font: bodyFont });
  return doc.save();
}
