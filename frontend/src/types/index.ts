// ========================================
// Core Domain Types
// ========================================

export type UserRole = 'student' | 'instructor' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  role?: 'student' | 'instructor';
}

// ========================================
// Course Types
// ========================================

export type CourseStatus = 'draft' | 'pending' | 'published' | 'rejected';
export type CourseDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Course {
  id: string;
  title: string;
  description: string;
  instructorId: string | null;
  instructor?: User;
  instructorName?: string;
  status: CourseStatus;
  category?: string;
  difficulty?: CourseDifficulty;
  thumbnailUrl?: string;
  estimatedHours?: number;
  createdAt: string;
  updatedAt: string;
  modules?: Module[];
  lectureCount?: number;
  // Computed fields (not in backend model but needed by frontend)
  isEnrolled?: boolean;
  isPublished?: boolean; // Helper: status === 'published'
  duration?: number;
  certificateOffered?: boolean;
  progress?: number;
  enrollmentCount?: number;
  // Rating aggregates (normalized camelCase; backend sends snake_case)
  avgRating?: number;
  ratingCount?: number;
}

export interface Module {
  id: string;
  courseId: string | null;
  title: string;
  description?: string;
  orderIndex?: number;
  sortOrder?: number;
  createdAt?: string;
  lectures?: Lecture[];
}

export interface Lecture {
  id: string;
  moduleId: string | null;
  title: string;
  description?: string;
  videoKey?: string;
  videoUrl?: string;
  duration?: number;
  durationS?: number;
  orderIndex?: number;
  sortOrder?: number;
  createdAt?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  courses?: T[]; // Alias for catalog compatibility
}

export interface CourseFilters {
  page?: number;
  pageSize?: number;
  limit?: number;
  q?: string;
  status?: CourseStatus;
  search?: string;
  category?: string;
  difficulty?: CourseDifficulty | string;
  /** Minimum average rating. Only applies when the backend actually returns
   *  rating data (avgRating/rating); otherwise it matches nothing rather than
   *  filtering on fabricated values. */
  minRating?: number;
}

// ========================================
// Learning Types
// ========================================

export interface Enrollment {
  id: string;
  userId?: string;
  courseId: string | null;
  enrolledAt?: string;
  createdAt?: string;
  completedAt?: string;
  progressPercent: number;
  course?: Course;
  courseTitle?: string;
  courseStatus?: string;
  progress?: number; // Alias for progressPercent
  lastAccessedLectureId?: string; // Last lecture viewed
}

export interface LectureProgress {
  id: string;
  userId: string;
  lectureId: string;
  watchedSeconds: number;
  completed: boolean;
  lastWatchedAt: string;
  lastPosition?: number; // Video position in seconds
}

export interface Note {
  id: string;
  userId: string;
  lectureId: string;
  content: string;
  timestampSeconds?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Bookmark {
  id: string;
  userId: string;
  lectureId: string;
  timestampSeconds: number;
  createdAt: string;
}

// ========================================
// Assignment Types
// ========================================

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueAt?: string;
  maxScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  userId: string;
  submittedAt: string;
  grade?: number;
  feedback?: string;
  fileKey?: string;
  fileUrl?: string;
  gradedAt?: string;
}

// ========================================
// Quiz Types
// ========================================

export type QuizQuestionType = 'mcq' | 'multi_select' | 'short_answer';
export type AttemptStatus = 'in_progress' | 'submitted' | 'graded';

export interface Quiz {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  passingScore?: number;
  timeLimit?: number;
  isAiGenerated: boolean;
  createdAt: string;
  questions?: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  type: QuizQuestionType;
  questionText: string;
  points: number;
  orderIndex: number;
  options?: QuizOption[];
}

export interface QuizOption {
  id: string;
  questionId: string;
  optionText: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  userId: string;
  startedAt: string;
  submittedAt?: string;
  score?: number;
  maxScore?: number;
  totalPoints: number;
  status: AttemptStatus;
  answers?: QuizAnswer[];
}

export interface QuizAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  selectedOptionIds?: string[];
  answerText?: string;
  isCorrect?: boolean;
  pointsAwarded?: number;
}

// ========================================
// AI Types
// ========================================

export type AIMode = 'beginner' | 'intermediate' | 'advanced';

export interface ChatSession {
  id: string;
  userId: string;
  courseId: string;
  mode: AIMode;
  createdAt: string;
  messages?: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  groundedFallback?: boolean;
  createdAt: string;
}

export interface LectureSummary {
  lectureId: string;
  // Real backend shape: { lectureId, summary: { keyPoints, takeaways }, provider }
  summary?: { keyPoints: string[]; takeaways: string[] };
  provider?: string;
  // Flattened conveniences (populated by UI from summary when present)
  keyPoints?: string[];
  takeaways?: string[];
  generatedAt?: string;
}

export interface AIQuizDraft {
  id: string;
  lectureId: string;
  courseId: string;
  status: 'pending_review' | 'approved' | 'rejected';
  questions: any[];
  createdAt: string;
  reviewedAt?: string;
  activeQuizId?: string;
}

export interface Flashcard {
  id: string;
  moduleId: string;
  userId: string;
  front: string;
  back: string;
  createdAt: string;
}

export interface StudyPlan {
  id: string;
  userId: string;
  courseId: string;
  mastery: AIMode;
  quizRatio: number;
  weeks: StudyWeek[];
  createdAt: string;
  updatedAt: string;
}

export interface StudyWeek {
  weekNumber: number;
  focus: string;
  topics: string[];
  estimatedHours: number;
}

export interface Mastery {
  // Real backend shape from GET /ai/mastery/:courseId
  topic?: string;
  attempts?: number;
  avgScoreRatio?: number | null;
  level: AIMode;
  formula?: string;
  // Legacy aliases
  courseId?: string;
  quizRatio?: number;
  attemptsCount?: number;
}

export interface Recommendation {
  type: 'continue' | 'review' | 'next';
  title: string;
  description: string;
  lectureId?: string;
  courseId?: string;
  thumbnailUrl?: string;
  reason?: string;
  category?: string;
  difficulty?: CourseDifficulty;
}

// ========================================
// Gamification Types
// ========================================

export interface Badge {
  id: string;
  badgeKey: string;
  name: string;
  description: string;
  iconUrl?: string;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  awardedAt: string;
  badge?: Badge;
}

export interface GamificationStats {
  currentStreak: number;
  longestStreak: number;
  lastActivityAt?: string;
  badges: { id: string; name: string; awardedAt?: string }[];
}

// ========================================
// Certificate Types
// ========================================

export interface Certificate {
  id: string;
  userId: string;
  courseId: string | null;
  courseTitle?: string;
  certificateCode?: string;
  issuedAt?: string;
  pdfKey?: string;
  course?: Course;
}

// ========================================
// Analytics Types (match GET /api/v1/courses/:id/analytics exactly)
// ========================================

export interface AnalyticsPerLecture {
  lectureId: string;
  title: string;
  enrolled: number;
  completed: number;
  dropOffRate: number;
  avgWatchedSeconds: number;
}

export interface AnalyticsQuizRow {
  quiz_id: string;
  title: string;
  avg_score: number;
  avg_max_score: number;
  attempts: number;
}

export interface AnalyticsTimeOnTask {
  total_watched_seconds: number;
  active_students: number;
}

export interface CourseAnalytics {
  perLecture: AnalyticsPerLecture[];
  quizzes: AnalyticsQuizRow[];
  timeOnTask: AnalyticsTimeOnTask;
  // Legacy optional aliases (not returned by backend; kept for compat)
  courseId?: string;
  totalEnrolled?: number;
  totalCompleted?: number;
  averageProgress?: number;
  totalWatchedSeconds?: number;
  activeStudents?: number;
  lectureStats?: LectureStats[];
  quizStats?: QuizStats[];
}

export interface LectureStats {
  lectureId: string;
  lectureTitle: string;
  enrolled: number;
  completed: number;
  averageWatchedSeconds: number;
  dropOffRate: number;
}

export interface QuizStats {
  quizId: string;
  quizTitle: string;
  totalAttempts: number;
  averageScore: number;
  passRate: number;
}

// ========================================
// API Error Types
// ========================================

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}
