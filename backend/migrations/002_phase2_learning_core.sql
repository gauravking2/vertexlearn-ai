CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments (user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments (course_id);

CREATE TABLE IF NOT EXISTS lecture_progress (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  lecture_id UUID NOT NULL REFERENCES lectures (id) ON DELETE CASCADE,
  watched_seconds INTEGER NOT NULL DEFAULT 0 CHECK (watched_seconds >= 0),
  completed BOOLEAN NOT NULL DEFAULT false,
  last_watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lecture_id)
);

CREATE INDEX IF NOT EXISTS idx_lecture_progress_user ON lecture_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_lecture_progress_lecture ON lecture_progress (lecture_id);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  lecture_id UUID NOT NULL REFERENCES lectures (id) ON DELETE CASCADE,
  timestamp_seconds INTEGER NOT NULL DEFAULT 0 CHECK (timestamp_seconds >= 0),
  content TEXT NOT NULL CHECK (char_length(content) >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes (user_id);
CREATE INDEX IF NOT EXISTS idx_notes_lecture ON notes (lecture_id);

CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  lecture_id UUID NOT NULL REFERENCES lectures (id) ON DELETE CASCADE,
  timestamp_seconds INTEGER NOT NULL DEFAULT 0 CHECK (timestamp_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lecture_id, timestamp_seconds)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks (user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_lecture ON bookmarks (lecture_id);

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) >= 1),
  description TEXT NOT NULL DEFAULT '',
  due_at TIMESTAMPTZ,
  max_score INTEGER NOT NULL DEFAULT 100 CHECK (max_score >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments (course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_instructor ON assignments (instructor_id);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id UUID PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  file_key TEXT,
  file_name TEXT,
  file_size_bytes INTEGER CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  mime_type TEXT,
  content_text TEXT NOT NULL DEFAULT '',
  grade INTEGER CHECK (grade IS NULL OR grade >= 0),
  feedback TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at TIMESTAMPTZ,
  graded_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions (assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON assignment_submissions (student_id);

CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) >= 1),
  description TEXT NOT NULL DEFAULT '',
  is_ai_generated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_course ON quizzes (course_id);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY,
  quiz_id UUID NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('mcq', 'multi_select', 'short_answer')),
  prompt TEXT NOT NULL CHECK (char_length(prompt) >= 1),
  points INTEGER NOT NULL DEFAULT 1 CHECK (points >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions (quiz_id);

CREATE TABLE IF NOT EXISTS quiz_options (
  id UUID PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES quiz_questions (id) ON DELETE CASCADE,
  option_text TEXT NOT NULL CHECK (char_length(option_text) >= 1),
  is_correct BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_quiz_options_question ON quiz_options (question_id);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id UUID PRIMARY KEY,
  quiz_id UUID NOT NULL REFERENCES quizzes (id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'graded')),
  score INTEGER CHECK (score IS NULL OR score >= 0),
  max_score INTEGER CHECK (max_score IS NULL OR max_score >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts (quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student ON quiz_attempts (student_id);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id UUID PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES quiz_attempts (id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES quiz_questions (id) ON DELETE CASCADE,
  selected_option_ids TEXT NOT NULL DEFAULT '[]',
  answer_text TEXT NOT NULL DEFAULT '',
  is_correct BOOLEAN,
  points_earned INTEGER NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_answers_attempt ON quiz_answers (attempt_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_question ON quiz_answers (question_id);

CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  certificate_code TEXT NOT NULL UNIQUE CHECK (char_length(certificate_code) >= 4),
  pdf_key TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates (user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course ON certificates (course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_code ON certificates (certificate_code);

CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (char_length(slug) >= 1),
  name TEXT NOT NULL CHECK (char_length(name) >= 1),
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO badges (id, slug, name, description) VALUES
  ('00000000-0000-4000-8000-000000000101', 'first-course-completed', 'First Course Completed', 'Awarded for completing your first course'),
  ('00000000-0000-4000-8000-000000000102', '7-day-streak', '7-Day Streak', 'Awarded for 7 consecutive days of learning activity'),
  ('00000000-0000-4000-8000-000000000103', 'perfect-quiz-score', 'Perfect Quiz Score', 'Awarded for scoring 100 percent on a quiz')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges (id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges (user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges (badge_id);

CREATE TABLE IF NOT EXISTS streaks (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  current_streak_days INTEGER NOT NULL DEFAULT 0 CHECK (current_streak_days >= 0),
  longest_streak_days INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak_days >= 0),
  last_activity_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
