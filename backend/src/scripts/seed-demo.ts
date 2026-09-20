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
 * - five published demo courses (varied categories/difficulties), each with
 *   1 module + 3 lectures (RAG-ready text), 1 assignment + 1 quiz (2 questions)
 * - student enrollment in the flagship course + one welcome notification
 *
 * Course content is plain instructional text (no media upload, no R2 needed).
 */

interface DemoCourseSpec {
  title: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  moduleTitle: string;
  lectures: string[];
  chunks: string[];
  assignmentTitle: string;
  assignmentDescription: string;
  quizTitle: string;
  quizDescription: string;
  quizQuestions: { prompt: string; correct: string; wrong: string }[];
}

const DEMO_COURSES: DemoCourseSpec[] = [
  {
    title: 'Intro to Learning Science (Demo)',
    description:
      'A demo course for the live VertexLearn AI walkthrough: study strategies, retrieval practice, and spaced repetition.',
    category: 'Data Science',
    difficulty: 'beginner',
    moduleTitle: 'Study foundations',
    lectures: ['How retrieval practice works', 'Spaced repetition basics', 'Elaboration and interleaving'],
    chunks: [
      'Retrieval practice means recalling information from memory. Testing yourself with low-stakes quizzes strengthens long-term retention far more than re-reading notes.',
      'Spaced repetition spreads review sessions over increasing intervals. Reviewing just before forgetting keeps memories durable with less total study time.',
      'Elaboration connects new ideas to what you already know by asking how and why. Interleaving mixes related topics so you learn to tell concepts apart.',
    ],
    assignmentTitle: 'Demo: write your study plan',
    assignmentDescription: 'In 200 words, describe how you will use retrieval practice and spaced repetition this week.',
    quizTitle: 'Demo: study strategies check',
    quizDescription: 'Two quick questions on retrieval practice and spacing.',
    quizQuestions: [
      {
        prompt: 'Which technique means recalling information from memory to strengthen learning?',
        correct: 'Retrieval practice',
        wrong: 'Re-reading notes passively',
      },
      {
        prompt: 'Spaced repetition works best when review sessions are…',
        correct: 'Spread out over time',
        wrong: 'Crammed the night before',
      },
    ],
  },
  {
    title: 'Python Fundamentals (Demo)',
    description: 'Variables, control flow, functions, and data structures in Python, taught through short hands-on examples.',
    category: 'Programming',
    difficulty: 'beginner',
    moduleTitle: 'Python basics',
    lectures: ['Variables and data types', 'Loops and conditionals', 'Functions and modules'],
    chunks: [
      'Python variables bind names to values with dynamic typing. Core data types include integers, floats, strings, lists, tuples, dictionaries, and booleans.',
      'Loops repeat work with for and while statements. Conditionals branch with if, elif, and else so programs react to data.',
      'Functions group reusable logic with def, parameters, and return values. Modules organize functions into importable files.',
    ],
    assignmentTitle: 'Demo: fizzbuzz in Python',
    assignmentDescription: 'Write a Python program that prints numbers 1 to 30 with FizzBuzz rules and explain your loop choice.',
    quizTitle: 'Demo: Python basics check',
    quizDescription: 'Two quick questions on Python types and control flow.',
    quizQuestions: [
      { prompt: 'Which Python type is an ordered, mutable sequence?', correct: 'list', wrong: 'tuple' },
      { prompt: 'Which keyword starts a conditional branch in Python?', correct: 'if', wrong: 'loop' },
    ],
  },
  {
    title: 'Web Application Security (Demo)',
    description: 'Threat models, authentication hardening, and OWASP Top 10 defenses for modern web applications.',
    category: 'Programming',
    difficulty: 'intermediate',
    moduleTitle: 'Secure web foundations',
    lectures: ['Threat modeling web apps', 'Authentication and sessions', 'OWASP Top 10 defenses'],
    chunks: [
      'Threat modeling maps assets, entry points, and attacker capabilities before code is written. Prioritize risks by likelihood and impact.',
      'Authentication hardening means strong password hashing, multi-factor checks, short-lived sessions, and secure cookie flags.',
      'The OWASP Top 10 covers injection, broken access control, and misconfiguration. Validate input, enforce least privilege, and patch dependencies.',
    ],
    assignmentTitle: 'Demo: threat model a login form',
    assignmentDescription: 'List three threats against a login form and one mitigation for each, referencing the lecture material.',
    quizTitle: 'Demo: web security check',
    quizDescription: 'Two quick questions on auth hardening and OWASP defenses.',
    quizQuestions: [
      { prompt: 'Which cookie flag helps prevent JavaScript access to session cookies?', correct: 'HttpOnly', wrong: 'Autofocus' },
      { prompt: 'Injection flaws are best prevented by…', correct: 'Validating and parameterizing input', wrong: 'Hiding error pages' },
    ],
  },
  {
    title: 'UI/UX Design Essentials (Demo)',
    description: 'Layout, typography, color, and usability testing fundamentals for clean, accessible interfaces.',
    category: 'Design',
    difficulty: 'beginner',
    moduleTitle: 'Design foundations',
    lectures: ['Layout and hierarchy', 'Typography and color', 'Usability testing basics'],
    chunks: [
      'Layout uses hierarchy, spacing, and alignment to guide attention. Group related controls and keep one primary action per screen.',
      'Typography pairs readable body text with clear headings. Color conveys meaning; keep contrast ratios accessible for all users.',
      'Usability testing watches five real users attempt core tasks. Fix the top friction points, then test again.',
    ],
    assignmentTitle: 'Demo: critique a signup screen',
    assignmentDescription: 'Critique a signup screen for hierarchy, typography, and contrast, and propose two concrete fixes.',
    quizTitle: 'Demo: design basics check',
    quizDescription: 'Two quick questions on hierarchy and usability testing.',
    quizQuestions: [
      { prompt: 'Visual hierarchy primarily guides…', correct: 'User attention', wrong: 'Server load' },
      { prompt: 'A first usability test needs about…', correct: 'Five users', wrong: 'Five hundred users' },
    ],
  },
  {
    title: 'Applied Business Analytics (Demo)',
    description: 'Metrics, cohorts, and experiments: turning product data into decisions with honest statistics.',
    category: 'Business',
    difficulty: 'intermediate',
    moduleTitle: 'Analytics in practice',
    lectures: ['Metrics and cohorts', 'Running honest experiments', 'Communicating results'],
    chunks: [
      'Good metrics pair a north-star outcome with guardrail metrics. Cohorts compare users by signup week so growth is not masked by averaging.',
      'Honest experiments pre-register a hypothesis, randomize, and wait for significance before shipping. Watch for novelty effects.',
      'Communicate results with the decision first, then the evidence. State uncertainty plainly and recommend the next test.',
    ],
    assignmentTitle: 'Demo: define a north-star metric',
    assignmentDescription: 'Pick a demo product, define its north-star metric plus two guardrails, and justify each.',
    quizTitle: 'Demo: analytics basics check',
    quizDescription: 'Two quick questions on cohorts and experiments.',
    quizQuestions: [
      { prompt: 'Cohorts most often group users by…', correct: 'Signup period', wrong: 'Shoe size' },
      { prompt: 'Before running an experiment you should…', correct: 'Pre-register a hypothesis', wrong: 'Delete the control group' },
    ],
  },
];

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

async function ensureDemoCourse(instructorId: string, spec: DemoCourseSpec): Promise<string> {
  const existing = await db.query(`SELECT id, status FROM courses WHERE title = $1`, [spec.title]);
  if (existing.rowCount) return (existing.rows[0] as { id: string }).id;
  const courseId = newId();
  try {
    await db.query(
      `INSERT INTO courses (id, instructor_id, title, description, status, category, difficulty)
       VALUES ($1, $2, $3, $4, 'published', $5, $6)`,
      [courseId, instructorId, spec.title, spec.description, spec.category, spec.difficulty],
    );
  } catch {
    await db.query(`INSERT INTO courses (id, instructor_id, title, description, status) VALUES ($1, $2, $3, $4, 'published')`, [
      courseId,
      instructorId,
      spec.title,
      spec.description,
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

async function ensureCurriculum(courseId: string, spec: DemoCourseSpec): Promise<{ lectureIds: string[]; moduleId: string }> {
  const mods = await db.query(`SELECT id FROM modules WHERE course_id = $1 ORDER BY sort_order LIMIT 1`, [courseId]);
  let moduleId: string;
  if (mods.rowCount) {
    moduleId = (mods.rows[0] as { id: string }).id;
  } else {
    moduleId = newId();
    await db.query(`INSERT INTO modules (id, course_id, title, sort_order) VALUES ($1, $2, $3, 0)`, [
      moduleId,
      courseId,
      spec.moduleTitle,
    ]);
  }
  const lectures = await db.query(`SELECT id FROM lectures WHERE module_id = $1 ORDER BY sort_order`, [moduleId]);
  if (lectures.rowCount) {
    return { lectureIds: (lectures.rows as { id: string }[]).map((r) => r.id), moduleId };
  }
  const ids: string[] = [];
  for (let i = 0; i < spec.lectures.length; i += 1) {
    const id = newId();
    await db.query(`INSERT INTO lectures (id, module_id, title, sort_order) VALUES ($1, $2, $3, $4)`, [id, moduleId, spec.lectures[i], i]);
    ids.push(id);
  }
  return { lectureIds: ids, moduleId };
}

async function ensureAssignment(courseId: string, instructorId: string, spec: DemoCourseSpec): Promise<string> {
  const existing = await db.query(`SELECT id FROM assignments WHERE course_id = $1 LIMIT 1`, [courseId]);
  if (existing.rowCount) return (existing.rows[0] as { id: string }).id;
  const id = newId();
  await db.query(
    `INSERT INTO assignments (id, course_id, instructor_id, title, description, max_score) VALUES ($1, $2, $3, $4, $5, 100)`,
    [id, courseId, instructorId, spec.assignmentTitle, spec.assignmentDescription],
  );
  return id;
}

async function ensureQuiz(courseId: string, instructorId: string, spec: DemoCourseSpec): Promise<string> {
  const existing = await db.query(`SELECT id FROM quizzes WHERE course_id = $1 LIMIT 1`, [courseId]);
  if (existing.rowCount) return (existing.rows[0] as { id: string }).id;
  const quizId = newId();
  await db.query(`INSERT INTO quizzes (id, course_id, instructor_id, title, description, is_ai_generated) VALUES ($1, $2, $3, $4, $5, false)`, [
    quizId,
    courseId,
    instructorId,
    spec.quizTitle,
    spec.quizDescription,
  ]);
  for (const q of spec.quizQuestions) {
    const qid = newId();
    await db.query(`INSERT INTO quiz_questions (id, quiz_id, type, prompt, points) VALUES ($1, $2, 'mcq', $3, 1)`, [qid, quizId, q.prompt]);
    await db.query(`INSERT INTO quiz_options (id, question_id, option_text, is_correct, sort_order) VALUES ($1, $2, $3, $4, $5)`, [
      newId(),
      qid,
      q.correct,
      true,
      0,
    ]);
    await db.query(`INSERT INTO quiz_options (id, question_id, option_text, is_correct, sort_order) VALUES ($1, $2, $3, $4, $5)`, [
      newId(),
      qid,
      q.wrong,
      false,
      1,
    ]);
  }
  return quizId;
}

async function ensureTranscriptChunks(courseId: string, lectureIds: string[], spec: DemoCourseSpec): Promise<number> {
  const existing = await db.query(`SELECT COUNT(*)::int AS count FROM document_chunks WHERE course_id = $1`, [courseId]);
  if (((existing.rows[0] as { count: number }).count ?? 0) > 0) return 0;
  let inserted = 0;
  for (let i = 0; i < lectureIds.length; i += 1) {
    await db.query(
      `INSERT INTO document_chunks (id, course_id, lecture_id, chunk_index, chunk_text, embedding) VALUES ($1, $2, $3, 0, $4, NULL)`,
      [randomUUID(), courseId, lectureIds[i], spec.chunks[i % spec.chunks.length]],
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
  let flagshipId = '';
  for (const spec of DEMO_COURSES) {
    const courseId = await ensureDemoCourse(instructorId, spec);
    const { lectureIds } = await ensureCurriculum(courseId, spec);
    await ensureTranscriptChunks(courseId, lectureIds, spec);
    await ensureAssignment(courseId, instructorId, spec);
    await ensureQuiz(courseId, instructorId, spec);
    if (!flagshipId) flagshipId = courseId;
  }
  // Demo learner stays enrolled in the flagship course only; other courses
  // follow normal enrollment behavior (catalog → open → enroll).
  await ensureEnrollment(studentId, flagshipId);
  await ensureWelcomeNotification(studentId, DEMO_COURSES[0].title);
  logger.info('demo seed complete (additive-only, idempotent)');
}

void main().catch((err) => {
  logger.error({ err }, 'demo seed failed');
  process.exitCode = 1;
});
