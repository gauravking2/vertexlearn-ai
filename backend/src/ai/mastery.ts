import { db } from '../db/pool';
import type { ExplanationMode } from './llm';

export interface TopicMastery {
  topic: string;
  attempts: number;
  avgScoreRatio: number;
  level: ExplanationMode;
}

export function masteryLevelFromRatio(ratio: number | null): ExplanationMode {
  if (ratio == null) return 'beginner';
  if (ratio >= 0.85) return 'advanced';
  if (ratio >= 0.6) return 'intermediate';
  return 'beginner';
}

export async function quizScoreRatio(userId: string, courseId: string): Promise<number | null> {
  const rows = await db.query(
    `SELECT a.score, a.max_score FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.student_id = $1 AND q.course_id = $2 AND a.status IN ('submitted', 'graded') AND a.max_score IS NOT NULL AND a.max_score > 0
     ORDER BY a.submitted_at DESC NULLS LAST, a.created_at DESC LIMIT 20`,
    [userId, courseId],
  );
  if (!rows.rowCount) return null;
  let earned = 0;
  let max = 0;
  for (const r of rows.rows as { score: number | null; max_score: number | null }[]) {
    earned += r.score ?? 0;
    max += r.max_score ?? 0;
  }
  if (max <= 0) return null;
  return earned / max;
}

export async function courseMastery(userId: string, courseId: string): Promise<TopicMastery> {
  const ratio = await quizScoreRatio(userId, courseId);
  const completionRes = await db.query(`SELECT progress_percent FROM enrollments WHERE user_id = $1 AND course_id = $2`, [userId, courseId]);
  const progress = ((completionRes.rows[0] as { progress_percent: number } | undefined)?.progress_percent ?? 0) / 100;
  const attemptsRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id WHERE a.student_id = $1 AND q.course_id = $2`,
    [userId, courseId],
  );
  const attempts = (attemptsRes.rows[0] as { count: number }).count;
  const blended = ratio == null ? progress * 0.4 : ratio * 0.8 + progress * 0.2;
  return { topic: 'course', attempts, avgScoreRatio: ratio ?? 0, level: masteryLevelFromRatio(ratio == null ? (progress >= 0.8 ? 0.65 : null) : blended) };
}

export function depthForMode(mode: ExplanationMode): string {
  if (mode === 'beginner') return 'simple language, definitions, one example';
  if (mode === 'advanced') return 'dense, precise, edge cases';
  return 'balanced intuition plus key detail';
}
