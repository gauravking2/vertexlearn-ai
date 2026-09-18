-- Phase 5: admin + discussions + announcements + notifications + course approvals

-- User suspension (safe additive columns)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT NOT NULL DEFAULT '';

-- Course approval history (one row per review event; latest row is authoritative)
CREATE TABLE IF NOT EXISTS course_approvals (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES users (id) ON DELETE SET NULL,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'rejected')),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_course_approvals_course ON course_approvals (course_id);
CREATE INDEX IF NOT EXISTS idx_course_approvals_decision ON course_approvals (decision);

-- Discussion threads (per-course)
CREATE TABLE IF NOT EXISTS discussion_threads (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) >= 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_hidden BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_discussion_threads_course ON discussion_threads (course_id);
CREATE INDEX IF NOT EXISTS idx_discussion_threads_author ON discussion_threads (author_id);

-- Discussion posts (threaded via optional parent_post_id)
CREATE TABLE IF NOT EXISTS discussion_posts (
  id UUID PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES discussion_threads (id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) >= 1),
  parent_post_id UUID REFERENCES discussion_posts (id) ON DELETE SET NULL,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  flag_count INTEGER NOT NULL DEFAULT 0 CHECK (flag_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discussion_posts_thread ON discussion_posts (thread_id);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_author ON discussion_posts (author_id);

-- Discussion flags / reports
CREATE TABLE IF NOT EXISTS discussion_flags (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES discussion_posts (id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS idx_discussion_flags_post ON discussion_flags (post_id);
CREATE INDEX IF NOT EXISTS idx_discussion_flags_status ON discussion_flags (status);

-- Announcements (instructor-owned, per-course)
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) >= 3),
  body TEXT NOT NULL CHECK (char_length(body) >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_course ON announcements (course_id);

-- In-app notifications (user-isolated; user_id always from JWT)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (char_length(type) >= 1),
  title TEXT NOT NULL CHECK (char_length(title) >= 1),
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read);
