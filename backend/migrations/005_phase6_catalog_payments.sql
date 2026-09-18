-- Phase 6: course catalog metadata, real reviews/ratings, payments foundation.
-- Idempotent (IF NOT EXISTS) so `npm run migrate` can safely re-apply.

-- Catalog metadata on the existing courses table (PRD catalog filtering).
ALTER TABLE courses ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'beginner';

-- Backfill guard: only allow the PRD difficulty set for newly written rows.
-- (Existing rows default to 'beginner'; a separate CHECK is avoided so that
-- legacy rows can never violate the migration on re-apply.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_difficulty_check') THEN
    ALTER TABLE courses ADD CONSTRAINT courses_difficulty_check
      CHECK (difficulty IN ('beginner', 'intermediate', 'advanced'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courses_category ON courses (category);
CREATE INDEX IF NOT EXISTS idx_courses_difficulty ON courses (difficulty);

-- Real course reviews/ratings (one per student per course; aggregate only,
-- never hardcoded). Averages are computed at read time.
CREATE TABLE IF NOT EXISTS course_reviews (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_reviews_course ON course_reviews (course_id);
CREATE INDEX IF NOT EXISTS idx_course_reviews_user ON course_reviews (user_id);

-- Payments foundation (PRD payments entity). No gateway is implemented;
-- records are created by explicit admin recording (or a future provider
-- webhook) and revenue aggregates only `completed` rows. Amounts are integer
-- minor units (cents). No fake transactions are ever seeded.
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  course_id UUID REFERENCES courses (id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_ref TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_course ON payments (course_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id);
