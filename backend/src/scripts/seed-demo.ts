import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { db, newId } from '../db/pool';
import { hashPassword } from '../auth/password';
import { logger } from '../logger';

/**
 * Production-safe demo seed (idempotent, additive-only).
 *
 * - NEVER deletes or overwrites existing production data.
 * - NEVER changes passwords of existing users.
 * - NEVER manufactures certificates or grades.
 * - Secrets only arrive via environment (DEMO_* names); nothing is hardcoded.
 * - Safe to run more than once: every insert is existence-checked first.
 *
 * Creates (only when missing):
 * - demo instructor account (DEMO_INSTRUCTOR_EMAIL)
 * - demo student account (DEMO_STUDENT_EMAIL)
 * - one published demo course with 1 module + 3 lectures (RAG-ready text)
 * - 1 assignment + 1 quiz (2 questions) owned by the demo instructor
 * - student enrollment + one welcome notification
 *
 * Course content is plain instructional text (no media upload, no R2 needed).
 */

const DEMO_COURSE_SLUG = 'demo-intro-to-learning-science';

async function ensureRole(email: string, role: string, userId: string): Promise<void> {
  const roleRow = await db.query(`SELECT id FROM roles WHERE name = $1`, [role]);
  const roleId = (roleRow.rows[0] as { id: string } | undefined)?.id;
  if (!roleId) throw new Error(`role ${role} missing — run migrations first`);
  await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, roleId]);
}

async function ensureUser(email: string, name: string, role: string): Promise<string> {
  const existing = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rowCount) {
    const userId = (existing.rows[0] as { id: string }).id;
    await ensureRole(email, role, userId);
    return userId;
  }
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('Refusing to create demo users: set DEMO_PASSWORD (min 12 chars) in the environment');
  }
  const userId = newId();
  await db.query(`INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)`, [
    userId,
    email,
    await hashPassword(password),
    name,
  ]);
  await ensureRole(email, role, userId);
  return userId;
}

async function ensureDemoCourse(instructorId: string): Promise<string> {
  const existing = await db.query(`SELECT id, status FROM courses WHERE title = $1`, ['Intro to Learning Science (Demo)']);
  if (existing.rowCount) return (existing.rows[0] as { id: string }).id;
  const courseId = newId();
  try {
    await db.query(
      `INSERT INTO courses (id, instructor_id, title, description, status, category, difficulty)
       VALUES ($1, $2, $3, $4, 'published', 'Data Science', 'beginner')`,
      [
        courseId,
        instructorId,
        'Intro to Learning Science (Demo)',
        'A demo course for the live VertexLearn AI walkthrough: study strategies, retrieval practice, and spaced repetition.',
      ],
    );
  } catch {
    await db.query(`INSERT INTO courses (id, instructor_id, title, description, status) VALUES ($1, $2, $3, $4, 'published')`, [
      courseId,
      instructorId,
      'Intro to Learning Science (Demo)',
      'A demo course for the live VertexLearn AI walkthrough.',
    ]);
  }
  await db.query(
    `INSERT INTO course_approvals (id, course_id, requested_by, reviewer_id, decision, comment, decided_at)
     VALUES ($1, $2, $3, $3, 'approved', 'demo seed', now()) ON CONFLICT DO NOTHING`,
    [newId(), courseId, instructorId],
  ).catch(() => undefined);
  void DEMO_COURSE_SLUG;
  return courseId;
}

async function ensureCurriculum(courseId: string): Promise<{ lectureIds: string[]; moduleId: string }> {
  const mods = await db.query(`SELECT id FROM modules WHERE course_id = $1 ORDER BY sort_order LIMIT 1`, [courseId]);
  let moduleId: string;
  if (mods.rowCount) {
    moduleId = (mods.rows[0] as { id: string }).id;
  } else {
    moduleId = newId();
    await db.query(`INSERT INTO modules (id, course_id, title, sort_order) VALUES ($1, $2, $3, 0)`, [
      moduleId,
      courseId,
      'Study foundations',
    ]);
  }
  const lectures = await db.query(`SELECT id FROM lectures WHERE module_id = $1 ORDER BY sort_order`, [moduleId]);
  if (lectures.rowCount) {
    return { lectureIds: (lectures.rows as { id: string }[]).map((r) => r.id), moduleId };
  }
  const titles = ['How retrieval practice works', 'Spaced repetition basics', 'Elaboration and interleaving'];
  const ids: string[] = [];
  for (let i = 0; i < titles.length; i += 1) {
    const id = newId();
    await db.query(`INSERT INTO lectures (id, module_id, title, sort_order) VALUES ($1, $2, $3, $4)`, [id, moduleId, titles[i], i]);
    ids.push(id);
  }
  return { lectureIds: ids, moduleId };
}

async function ensureAssignment(courseId: string, instructorId: string): Promise<string> {
  const existing = await db.query(`SELECT id FROM assignments WHERE course_id = $1 LIMIT 1`, [courseId]);
  if (existing.rowCount) return (existing.rows[0] as { id: string }).id;
  const id = newId();
  await db.query(
    `INSERT INTO assignments (id, course_id, instructor_id, title, description, max_score) VALUES ($1, $2, $3, $4, $5, 100)`,
    [
      id,
      courseId,
      instructorId,
      'Demo: write your study plan',
      'In 200 words, describe how you will use retrieval practice and spaced repetition this week.',
    ],
  );
  return id;
}

async function ensureQuiz(courseId: string, instructorId: string): Promise<string> {
  const existing = await db.query(`SELECT id FROM quizzes WHERE course_id = $1 LIMIT 1`, [courseId]);
  if (existing.rowCount) return (existing.rows[0] as { id: string }).id;
  const quizId = newId();
  await db.query(`INSERT INTO quizzes (id, course_id, instructor_id, title, description, is_ai_generated) VALUES ($1, $2, $3, $4, $5, false)`, [
    quizId,
    courseId,
    instructorId,
    'Demo: study strategies check',
    'Two quick questions on retrieval practice and spacing.',
  ]);
  const q1 = newId();
  const q2 = newId();
  await db.query(`INSERT INTO quiz_questions (id, quiz_id, type, prompt, points) VALUES ($1, $2, 'mcq', $3, 1)`, [
    q1,
    quizId,
    'Which technique means recalling information from memory to strengthen learning?',
  ]);
  await db.query(`INSERT INTO quiz_options (id, question_id, option_text, is_correct, sort_order) VALUES ($1, $2, $3, $4, $5)`, [
    newId(),
    q1,
    'Retrieval practice',
    true,
    0,
  ]);
  await db.query(`INSERT INTO quiz_options (id, question_id, option_text, is_correct, sort_order) VALUES ($1, $2, $3, $4, $5)`, [
    newId(),
    q1,
    'Re-reading notes passively',
    false,
    1,
  ]);
  await db.query(`INSERT INTO quiz_questions (id, quiz_id, type, prompt, points) VALUES ($1, $2, 'mcq', $3, 1)`, [
    q2,
    quizId,
    'Spaced repetition works best when review sessions are…',
  ]);
  await db.query(`INSERT INTO quiz_options (id, question_id, option_text, is_correct, sort_order) VALUES ($1, $2, $3, $4, $5)`, [
    newId(),
    q2,
    'Spread out over time',
    true,
    0,
  ]);
  await db.query(`INSERT INTO quiz_options (id, question_id, option_text, is_correct, sort_order) VALUES ($1, $2, $3, $4, $5)`, [
    newId(),
    q2,
    'Crammed the night before',
    false,
    1,
  ]);
  return quizId;
}

async function ensureTranscriptChunks(courseId: string, lectureIds: string[]): Promise<number> {
  const existing = await db.query(`SELECT COUNT(*)::int AS count FROM document_chunks WHERE course_id = $1`, [courseId]);
  if (((existing.rows[0] as { count: number }).count ?? 0) > 0) return 0;
  const texts = [
    'Retrieval practice means recalling information from memory. Testing yourself with low-stakes quizzes strengthens long-term retention far more than re-reading notes.',
    'Spaced repetition spreads review sessions over increasing intervals. Reviewing just before forgetting keeps memories durable with less total study time.',
    'Elaboration connects new ideas to what you already know by asking how and why. Interleaving mixes related topics so you learn to tell concepts apart.',
  ];
  let inserted = 0;
  for (let i = 0; i < lectureIds.length; i += 1) {
    await db.query(
      `INSERT INTO document_chunks (id, course_id, lecture_id, chunk_index, chunk_text, embedding) VALUES ($1, $2, $3, 0, $4, NULL)`,
      [randomUUID(), courseId, lectureIds[i], texts[i % texts.length]],
    );
    inserted += 1;
  }
  return inserted;
}

async function ensureEnrollment(studentId: string, courseId: string): Promise<void> {
  await db.query(`INSERT INTO enrollments (id, user_id, course_id, progress_percent) VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING`, [
    newId(),
    studentId,
    courseId,
  ]);
}

async function ensureWelcomeNotification(studentId: string, courseTitle: string): Promise<void> {
  const existing = await db.query(`SELECT id FROM notifications WHERE user_id = $1 AND title = $2 LIMIT 1`, [
    studentId,
    `Enrolled: ${courseTitle}`,
  ]);
  if (existing.rowCount) return;
  await db.query(`INSERT INTO notifications (id, user_id, type, title, body, link) VALUES ($1, $2, 'enrollment', $3, $4, $5)`, [
    newId(),
    studentId,
    `Enrolled: ${courseTitle}`,
    'Welcome to your demo course. Open it to start learning.',
    '/dashboard',
  ]);
}

async function main(): Promise<void> {
  const instructorEmail = process.env.DEMO_INSTRUCTOR_EMAIL ?? 'demo.instructor@vertexlearn.ai';
  const studentEmail = process.env.DEMO_STUDENT_EMAIL ?? 'demo.student@vertexlearn.ai';
  const instructorId = await ensureUser(instructorEmail, 'Demo Instructor', 'instructor');
  const studentId = await ensureUser(studentEmail, 'Demo Student', 'student');
  const courseId = await ensureDemoCourse(instructorId);
  const { lectureIds } = await ensureCurriculum(courseId);
  await ensureTranscriptChunks(courseId, lectureIds);
  await ensureAssignment(courseId, instructorId);
  await ensureQuiz(courseId, instructorId);
  await ensureEnrollment(studentId, courseId);
  await ensureWelcomeNotification(studentId, 'Intro to Learning Science (Demo)');
  logger.info('demo seed complete (additive-only, idempotent)');
}

void main().catch((err) => {
  logger.error({ err }, 'demo seed failed');
  process.exitCode = 1;
});
