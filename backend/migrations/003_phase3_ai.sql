CREATE TABLE IF NOT EXISTS lecture_transcripts (
  lecture_id UUID PRIMARY KEY REFERENCES lectures (id) ON DELETE CASCADE,
  transcript TEXT NOT NULL CHECK (char_length(transcript) >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  lecture_id UUID REFERENCES lectures (id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
  chunk_text TEXT NOT NULL CHECK (char_length(chunk_text) >= 1),
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_course ON document_chunks (course_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_lecture ON document_chunks (lecture_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'beginner' CHECK (mode IN ('beginner', 'intermediate', 'advanced')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_user ON ai_chat_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_course ON ai_chat_sessions (course_id);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES ai_chat_sessions (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL CHECK (char_length(content) >= 1),
  sources TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON ai_chat_messages (session_id);

CREATE TABLE IF NOT EXISTS ai_quiz_drafts (
  id UUID PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  lecture_id UUID REFERENCES lectures (id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected')),
  payload TEXT NOT NULL DEFAULT '{}',
  approved_quiz_id UUID REFERENCES quizzes (id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_drafts_course ON ai_quiz_drafts (course_id);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_status ON ai_quiz_drafts (status);

CREATE TABLE IF NOT EXISTS flashcards (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
  front TEXT NOT NULL CHECK (char_length(front) >= 1),
  back TEXT NOT NULL CHECK (char_length(back) >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_user ON flashcards (user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_module ON flashcards (module_id);

CREATE TABLE IF NOT EXISTS study_plans (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_study_plans_user ON study_plans (user_id);

CREATE TABLE IF NOT EXISTS recommendations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('continue', 'review', 'next')),
  title TEXT NOT NULL CHECK (char_length(title) >= 1),
  reason TEXT NOT NULL DEFAULT '',
  score DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (score >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recommendations_user ON recommendations (user_id);
