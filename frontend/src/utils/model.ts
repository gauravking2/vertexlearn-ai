/**
 * Single controlled model-mapping layer (frontend).
 *
 * The backend speaks snake_case; the UI speaks camelCase. Every service maps
 * its responses through these normalizers so components never guess field
 * names — this fixes the historic /courses/undefined + NaN% class of bugs at
 * the boundary instead of in each component.
 *
 * Rules:
 * - Missing/invalid IDs map to null and callers must not render links for
 *   null IDs (use `validId()`).
 * - Missing numbers map to 0 via `num()`; percentages via `safePercent()`.
 * - Unknown extra fields pass through untouched.
 */

export type SnakeRow = Record<string, any>;

function isObj(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Non-empty string ID or null. Never return undefined to link builders. */
export function validId(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Finite number or 0 (never NaN/Infinity/undefined). */
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/**
 * Safe 0–100 progress percentage. Any missing/zero-denominator/invalid
 * input yields 0 — never NaN, Infinity, or undefined.
 */
export function safePercent(value: unknown): number {
  const n = num(value, 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Display string for a percentage (always like "42%", never "NaN%"). */
export function displayPercent(value: unknown): string {
  return `${safePercent(value)}%`;
}

export function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

export function isoDate(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export interface CourseModel {
  id: string;
  title: string;
  description: string;
  status: string;
  instructorId: string | null;
  instructorName?: string;
  category: string;
  difficulty: string;
  avgRating: number;
  ratingCount: number;
  enrollmentCount: number;
  thumbnailUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  modules: ModuleModel[];
  raw: SnakeRow;
}

export interface ModuleModel {
  id: string;
  courseId: string | null;
  title: string;
  sortOrder: number;
  createdAt?: string;
  lectures: LectureModel[];
}

export interface LectureModel {
  id: string;
  moduleId: string | null;
  title: string;
  sortOrder: number;
  videoKey?: string;
  durationS?: number;
}

export function normalizeLecture(row: SnakeRow): LectureModel {
  const r = isObj(row) ? row : {};
  return {
    id: str(r.id ?? r.lectureId ?? r.lecture_id),
    moduleId: validId(r.moduleId ?? r.module_id),
    title: str(r.title, 'Untitled lecture'),
    sortOrder: num(r.sortOrder ?? r.sort_order, 0),
    videoKey: r.videoKey ?? r.video_key ?? undefined,
    durationS: r.durationS ?? r.duration_s ?? r.duration ?? undefined,
  };
}

export function normalizeModule(row: SnakeRow, courseId?: string): ModuleModel {
  const r = isObj(row) ? row : {};
  return {
    id: str(r.id ?? r.moduleId ?? r.module_id),
    courseId: validId(r.courseId ?? r.course_id ?? courseId),
    title: str(r.title, 'Untitled module'),
    sortOrder: num(r.sortOrder ?? r.sort_order, 0),
    createdAt: r.createdAt ?? r.created_at ?? undefined,
    lectures: Array.isArray(r.lectures) ? r.lectures.map(normalizeLecture) : [],
  };
}

export function normalizeCourse(row: SnakeRow): CourseModel {
  const r = isObj(row) ? row : {};
  const id = str(r.id ?? r.courseId ?? r.course_id);
  return {
    id,
    title: str(r.title, 'Untitled course'),
    description: str(r.description),
    status: str(r.status, 'draft'),
    instructorId: validId(r.instructorId ?? r.instructor_id),
    instructorName: r.instructorName ?? r.instructor_name ?? r.instructor?.name ?? undefined,
    category: str(r.category),
    difficulty: str(r.difficulty, 'beginner'),
    avgRating: num(r.avgRating ?? r.avg_rating, 0),
    ratingCount: num(r.ratingCount ?? r.rating_count, 0),
    enrollmentCount: num(r.enrollmentCount ?? r.enrollment_count ?? r.enrollments, 0),
    thumbnailUrl: r.thumbnailUrl ?? r.thumbnail_url ?? undefined,
    createdAt: r.createdAt ?? r.created_at ?? undefined,
    updatedAt: r.updatedAt ?? r.updated_at ?? undefined,
    modules: Array.isArray(r.modules) ? r.modules.map((m: SnakeRow) => normalizeModule(m, id)) : [],
    raw: r,
  };
}

export interface EnrollmentModel {
  id: string;
  courseId: string | null;
  progressPercent: number;
  completedAt?: string;
  createdAt?: string;
  courseTitle: string;
  courseStatus: string;
}

export function normalizeEnrollment(row: SnakeRow): EnrollmentModel {
  const r = isObj(row) ? row : {};
  const nested = isObj(r.course) ? r.course : {};
  return {
    id: str(r.id),
    courseId: validId(r.courseId ?? r.course_id),
    progressPercent: safePercent(r.progressPercent ?? r.progress_percent),
    completedAt: r.completedAt ?? r.completed_at ?? undefined,
    createdAt: r.createdAt ?? r.created_at ?? undefined,
    courseTitle: str(nested.title ?? r.courseTitle ?? r.course_title, 'Course'),
    courseStatus: str(nested.status ?? r.courseStatus ?? r.course_status),
  };
}

export interface AssignmentModel {
  id: string;
  courseId: string | null;
  title: string;
  description: string;
  dueAt?: string;
  maxScore: number;
  createdAt?: string;
}

export function normalizeAssignment(row: SnakeRow): AssignmentModel {
  const r = isObj(row) ? row : {};
  return {
    id: str(r.id),
    courseId: validId(r.courseId ?? r.course_id),
    title: str(r.title, 'Untitled assignment'),
    description: str(r.description),
    dueAt: isoDate(r.dueAt ?? r.due_at),
    maxScore: num(r.maxScore ?? r.max_score, 100) || 100,
    createdAt: r.createdAt ?? r.created_at ?? undefined,
  };
}

export interface SubmissionModel {
  id: string;
  assignmentId: string | null;
  studentId: string | null;
  studentName?: string;
  studentEmail?: string;
  grade: number | null;
  feedback: string;
  fileName?: string;
  mimeType?: string;
  contentText: string;
  submittedAt?: string;
  gradedAt?: string;
}

export function normalizeSubmission(row: SnakeRow): SubmissionModel {
  const r = isObj(row) ? row : {};
  return {
    id: str(r.id),
    assignmentId: validId(r.assignmentId ?? r.assignment_id),
    studentId: validId(r.studentId ?? r.student_id),
    studentName: r.studentName ?? r.student_name ?? undefined,
    studentEmail: r.studentEmail ?? r.student_email ?? undefined,
    grade: typeof r.grade === 'number' && Number.isFinite(r.grade) ? r.grade : null,
    feedback: str(r.feedback),
    fileName: r.fileName ?? r.file_name ?? undefined,
    mimeType: r.mimeType ?? r.mime_type ?? undefined,
    contentText: str(r.contentText ?? r.content_text),
    submittedAt: isoDate(r.submittedAt ?? r.submitted_at),
    gradedAt: isoDate(r.gradedAt ?? r.graded_at),
  };
}

export interface QuizOptionModel {
  id: string;
  optionText: string;
  isCorrect?: boolean;
}

export interface QuizQuestionModel {
  id: string;
  type: string;
  prompt: string;
  points: number;
  options: QuizOptionModel[];
}

export interface QuizModel {
  id: string;
  courseId: string | null;
  title: string;
  description: string;
  isAiGenerated: boolean;
  questionCount: number;
  questions: QuizQuestionModel[];
}

export function normalizeQuiz(row: SnakeRow): QuizModel {
  const r = isObj(row) ? row : {};
  const questions = Array.isArray(r.questions)
    ? r.questions.map((q: SnakeRow) => ({
        id: str(q.id),
        type: str(q.type, 'mcq'),
        prompt: str(q.prompt ?? q.questionText),
        points: num(q.points, 1),
        options: Array.isArray(q.options)
          ? q.options.map((o: SnakeRow) => ({
              id: str(o.id),
              optionText: str(o.optionText ?? o.option_text ?? o.text),
              isCorrect: typeof o.isCorrect === 'boolean' ? o.isCorrect : o.is_correct === true ? true : undefined,
            }))
          : [],
      }))
    : [];
  return {
    id: str(r.id),
    courseId: validId(r.courseId ?? r.course_id),
    title: str(r.title, 'Untitled quiz'),
    description: str(r.description),
    isAiGenerated: (r.isAiGenerated ?? r.is_ai_generated) === true,
    questionCount: num(r.questionCount ?? r.question_count, questions.length),
    questions,
  };
}

export function normalizeAttemptResult(row: SnakeRow): { score: number; maxScore: number; status: string } {
  const r = isObj(row) ? row : {};
  return {
    score: num(r.score, 0),
    maxScore: num(r.maxScore ?? r.max_score, 0),
    status: str(r.status),
  };
}

export interface NoteModel {
  id: string;
  lectureId: string | null;
  content: string;
  timestampSeconds: number;
  createdAt?: string;
}

export function normalizeNote(row: SnakeRow): NoteModel {
  const r = isObj(row) ? row : {};
  return {
    id: str(r.id),
    lectureId: validId(r.lectureId ?? r.lecture_id),
    content: str(r.content),
    timestampSeconds: num(r.timestampSeconds ?? r.timestamp_seconds, 0),
    createdAt: r.createdAt ?? r.created_at ?? undefined,
  };
}

export interface BookmarkModel {
  id: string;
  lectureId: string | null;
  timestampSeconds: number;
  createdAt?: string;
}

export function normalizeBookmark(row: SnakeRow): BookmarkModel {
  const r = isObj(row) ? row : {};
  return {
    id: str(r.id),
    lectureId: validId(r.lectureId ?? r.lecture_id),
    timestampSeconds: num(r.timestampSeconds ?? r.timestamp_seconds, 0),
    createdAt: r.createdAt ?? r.created_at ?? undefined,
  };
}

export interface CertificateModel {
  id: string;
  courseId: string | null;
  courseTitle: string;
  certificateCode: string;
  issuedAt?: string;
}

export function normalizeCertificate(row: SnakeRow): CertificateModel {
  const r = isObj(row) ? row : {};
  const nested = isObj(r.course) ? r.course : {};
  return {
    id: str(r.id),
    courseId: validId(r.courseId ?? r.course_id),
    courseTitle: str(nested.title ?? r.courseTitle ?? r.course_title, 'Certificate'),
    certificateCode: str(r.certificateCode ?? r.certificate_code ?? r.id),
    issuedAt: isoDate(r.issuedAt ?? r.issued_at),
  };
}

export interface GamificationModel {
  currentStreak: number;
  longestStreak: number;
  badges: { id: string; name: string; awardedAt?: string }[];
}

export function normalizeGamification(row: SnakeRow): GamificationModel {
  const r = isObj(row) ? row : {};
  const s = isObj(r.streak) ? r.streak : r;
  const badges = Array.isArray(r.badges) ? r.badges : [];
  return {
    currentStreak: num(s.currentStreak ?? s.current_streak_days ?? s.streak, 0),
    longestStreak: num(s.longestStreak ?? s.longest_streak_days, 0),
    badges: badges.map((b: SnakeRow, i: number) => ({
      id: str(b.id ?? b.slug ?? `badge-${i}`),
      name: str(b.name ?? b.slug, 'Badge'),
      awardedAt: b.awardedAt ?? b.awarded_at ?? undefined,
    })),
  };
}

export interface RecommendationModel {
  id: string;
  courseId: string | null;
  kind: string;
  title: string;
  reason: string;
  score: number;
}

export function normalizeRecommendation(row: SnakeRow, i = 0): RecommendationModel {
  const r = isObj(row) ? row : {};
  return {
    id: str(r.id ?? `rec-${i}`),
    courseId: validId(r.courseId ?? r.course_id),
    kind: str(r.kind ?? r.type, 'next'),
    title: str(r.title, 'Recommended'),
    reason: str(r.reason ?? r.description),
    score: num(r.score, 0),
  };
}

export interface NotificationModel {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt?: string;
}

export function normalizeNotification(row: SnakeRow): NotificationModel {
  const r = isObj(row) ? row : {};
  return {
    id: str(r.id),
    type: str(r.type, 'info'),
    title: str(r.title, 'Notification'),
    body: str(r.body),
    isRead: (r.isRead ?? r.is_read) === true,
    createdAt: r.createdAt ?? r.created_at ?? undefined,
  };
}

export function normalizeReview(row: SnakeRow): {
  id: string;
  rating: number;
  review: string;
  reviewerName: string;
  createdAt?: string;
} {
  const r = isObj(row) ? row : {};
  return {
    id: str(r.id),
    rating: num(r.rating, 0),
    review: str(r.review),
    reviewerName: str(r.reviewerName ?? r.reviewer_name, 'Student'),
    createdAt: r.createdAt ?? r.created_at ?? undefined,
  };
}

/** Paginated list helper: backend `{data, page, pageSize, total}`. */
export function normalizePage<T>(body: any, map: (row: SnakeRow, i: number) => T): { data: T[]; total: number; page: number; pageSize: number } {
  const b = isObj(body) ? body : {};
  const rows = Array.isArray(b.data) ? b.data : [];
  return {
    data: rows.map(map),
    total: num(b.total, rows.length),
    page: num(b.page, 1),
    pageSize: num(b.pageSize ?? b.page_size, rows.length || 20),
  };
}

// ---- Resume position (local, per user+course; real client-side resume) ----
const RESUME_KEY = 'vl-resume-positions';

export interface ResumePosition {
  courseId: string;
  lectureId: string;
  watchedSeconds: number;
  updatedAt: number;
}

function readResumeMap(): Record<string, ResumePosition> {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return isObj(parsed) ? (parsed as Record<string, ResumePosition>) : {};
  } catch {
    return {};
  }
}

export function saveResumePosition(userId: string, pos: Omit<ResumePosition, 'updatedAt'>): void {
  try {
    const map = readResumeMap();
    map[`${userId}:${pos.courseId}`] = { ...pos, updatedAt: Date.now() };
    localStorage.setItem(RESUME_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — resume simply won't persist
  }
}

export function getResumePosition(userId: string | undefined, courseId: string | undefined): ResumePosition | null {
  if (!userId || !courseId) return null;
  const pos = readResumeMap()[`${userId}:${courseId}`];
  if (!pos || !validId(pos.lectureId)) return null;
  return pos;
}

// ---- Quiz attempt ledger (local history of YOUR submitted attempts) ----
const ATTEMPT_KEY = 'vl-attempt-ledger';

export interface AttemptLedgerEntry {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  courseId?: string;
  score: number;
  maxScore: number;
  submittedAt: string;
}

function readLedgerMap(): Record<string, AttemptLedgerEntry[]> {
  try {
    const raw = localStorage.getItem(ATTEMPT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (Array.isArray(parsed)) return { __legacy: parsed as AttemptLedgerEntry[] };
    return isObj(parsed) ? (parsed as Record<string, AttemptLedgerEntry[]>) : {};
  } catch {
    return {};
  }
}

export function recordAttempt(userId: string | undefined, entry: Omit<AttemptLedgerEntry, 'submittedAt'>): void {
  if (!userId || !validId(entry.attemptId)) return;
  try {
    const map = readLedgerMap();
    const list = (map[userId] ?? []).filter((e) => e.attemptId !== entry.attemptId);
    list.unshift({ ...entry, submittedAt: new Date().toISOString() });
    map[userId] = list.slice(0, 100);
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — history simply won't persist
  }
}

export function getAttemptLedger(userId: string | undefined): AttemptLedgerEntry[] {
  if (!userId) return [];
  const map = readLedgerMap();
  return map[userId] ?? map.__legacy ?? [];
}

// ---- Category covers (generated abstract art; no external images) ----
const CATEGORY_HUES: Record<string, [number, number]> = {
  programming: [262, 210],
  design: [318, 265],
  business: [36, 18],
  'data science': [190, 230],
  marketing: [336, 300],
  science: [160, 200],
  physics: [220, 260],
  default: [24, 262],
};

export function categoryCover(category?: string): string {
  const key = (category || '').toLowerCase();
  const [h1, h2] = CATEGORY_HUES[key] ?? CATEGORY_HUES.default;
  return `linear-gradient(135deg, hsl(${h1} 55% 32%) 0%, hsl(${h2} 60% 22%) 55%, hsl(${h1} 45% 14%) 100%)`;
}

export function categoryInitial(title?: string): string {
  const t = (title || '?').trim();
  return t ? t.charAt(0).toUpperCase() : '?';
}
