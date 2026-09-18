import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DataType, newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { resetConfig } from '../src/config';
import { resetDb, setTestDb } from '../src/db/pool';

async function ensurePhase3TestTables(adminPool: Pool): Promise<void> {
  await adminPool.query(`
    CREATE TABLE IF NOT EXISTS lecture_transcripts (
      lecture_id UUID PRIMARY KEY REFERENCES lectures (id) ON DELETE CASCADE,
      transcript TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS document_chunks (
      id UUID PRIMARY KEY,
      course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
      lecture_id UUID REFERENCES lectures (id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      chunk_text TEXT NOT NULL,
      embedding TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_document_chunks_course ON document_chunks (course_id);
    CREATE INDEX IF NOT EXISTS idx_document_chunks_lecture ON document_chunks (lecture_id);
    CREATE TABLE IF NOT EXISTS ai_chat_sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'beginner',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id UUID PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES ai_chat_sessions (id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      sources TEXT NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS ai_quiz_drafts (
      id UUID PRIMARY KEY,
      course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
      lecture_id UUID REFERENCES lectures (id) ON DELETE CASCADE,
      created_by UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending_review',
      payload TEXT NOT NULL DEFAULT '{}',
      approved_quiz_id UUID,
      reviewed_by UUID,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS flashcards (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
      module_id UUID NOT NULL REFERENCES modules (id) ON DELETE CASCADE,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS study_plans (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, course_id)
    );
    CREATE TABLE IF NOT EXISTS recommendations (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      course_id UUID REFERENCES courses (id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      score DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function ensurePhase5TestTables(adminPool: Pool): Promise<void> {
  await adminPool.query(`ALTER TABLE users ADD COLUMN is_suspended BOOLEAN DEFAULT false;`).catch(() => undefined);
  await adminPool.query(`ALTER TABLE users ADD COLUMN suspended_at TIMESTAMPTZ;`).catch(() => undefined);
  await adminPool.query(`ALTER TABLE users ADD COLUMN suspended_reason TEXT DEFAULT '';`).catch(() => undefined);
  await adminPool.query(`
    CREATE TABLE IF NOT EXISTS course_approvals (
      id UUID PRIMARY KEY,
      course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
      requested_by UUID REFERENCES users (id) ON DELETE SET NULL,
      reviewer_id UUID REFERENCES users (id) ON DELETE SET NULL,
      decision TEXT NOT NULL DEFAULT 'pending',
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS discussion_threads (
      id UUID PRIMARY KEY,
      course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      is_hidden BOOLEAN NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS discussion_posts (
      id UUID PRIMARY KEY,
      thread_id UUID NOT NULL REFERENCES discussion_threads (id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      parent_post_id UUID,
      is_hidden BOOLEAN NOT NULL DEFAULT false,
      flag_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS discussion_flags (
      id UUID PRIMARY KEY,
      post_id UUID NOT NULL REFERENCES discussion_posts (id) ON DELETE CASCADE,
      reporter_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (post_id, reporter_id)
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id UUID PRIMARY KEY,
      course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_at TIMESTAMPTZ
    );
  `);
}

async function ensurePhase6TestTables(adminPool: Pool): Promise<void> {
  await adminPool.query(`ALTER TABLE courses ADD COLUMN category TEXT DEFAULT '';`).catch(() => undefined);
  await adminPool.query(`ALTER TABLE courses ADD COLUMN difficulty TEXT DEFAULT 'beginner';`).catch(() => undefined);
  await adminPool.query(`
    CREATE TABLE IF NOT EXISTS course_reviews (
      id UUID PRIMARY KEY,
      course_id UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      rating INTEGER NOT NULL DEFAULT 5,
      review TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, course_id)
    );
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY,
      user_id UUID REFERENCES users (id) ON DELETE SET NULL,
      course_id UUID REFERENCES courses (id) ON DELETE SET NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'pending',
      provider TEXT NOT NULL DEFAULT 'manual',
      provider_ref TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function useTestDb(): Promise<void> {  resetConfig();
  resetDb();
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  mem.public.registerFunction({
    name: 'char_length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (s: string) => (s == null ? 0 : String(s).length),
  });
  mem.public.registerFunction({
    name: 'length',
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (s: string) => (s == null ? 0 : String(s).length),
  });
  mem.public.registerFunction({
    name: 'now',
    returns: DataType.timestamptz,
    implementation: () => new Date(),
  });
  const files = (await fs.readdir(path.join(__dirname, '..', 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
  const pg = mem.adapters.createPg();
  const adminPool = new pg.Pool() as unknown as Pool;
  for (const file of files) {
    if (file === '003_phase3_ai.sql') continue;
    if (file === '004_phase5_admin_community.sql') continue;
    if (file === '005_phase6_catalog_payments.sql') continue;
    const sql = await fs.readFile(path.join(__dirname, '..', 'migrations', file), 'utf8');
    await adminPool.query(sql);
  }
  await ensurePhase3TestTables(adminPool);
  await ensurePhase5TestTables(adminPool);
  await ensurePhase6TestTables(adminPool);
  await adminPool.end();
  setTestDb({ getPool: () => new pg.Pool() as unknown as Pool });
}
