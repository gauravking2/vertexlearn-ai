import { db, newId } from '../db/pool';

export interface RecommendationInput {
  userId: string;
  courseId: string | null;
  kind: 'continue' | 'review' | 'next';
  title: string;
  reason: string;
  score: number;
}

export async function refreshRecommendationsForUser(userId: string): Promise<RecommendationInput[]> {
  const enrollments = await db.query(
    `SELECT e.course_id, e.progress_percent, c.title FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = $1 ORDER BY e.updated_at DESC`,
    [userId],
  );
  const out: RecommendationInput[] = [];
  for (const e of enrollments.rows as { course_id: string; progress_percent: number; title: string }[]) {
    if (e.progress_percent < 100) {
      const nextLecture = await db.query(
        `SELECT l.id, l.title FROM lectures l JOIN modules m ON m.id = l.module_id
         LEFT JOIN lecture_progress lp ON lp.lecture_id = l.id AND lp.user_id = $1
         WHERE m.course_id = $2 AND (lp.completed IS NULL OR lp.completed = false)
         ORDER BY m.sort_order, l.sort_order LIMIT 1`,
        [userId, e.course_id],
      );
      const lecture = nextLecture.rows[0] as { id: string; title: string } | undefined;
      out.push({
        userId,
        courseId: e.course_id,
        kind: 'continue',
        title: lecture ? `Continue: ${lecture.title}` : `Continue: ${e.title}`,
        reason: `Course progress is ${e.progress_percent}%. Next incomplete lecture first (rule-based).`,
        score: 0.9,
      });
    }
    const weak = await db.query(
      `SELECT q.title, a.score, a.max_score FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.student_id = $1 AND q.course_id = $2 AND a.status IN ('submitted', 'graded') LIMIT 50`,
      [userId, e.course_id],
    );
    const byTitle = new Map<string, { earned: number; max: number }>();
    for (const w of weak.rows as { title: string; score: number | null; max_score: number | null }[]) {
      const entry = byTitle.get(w.title) ?? { earned: 0, max: 0 };
      entry.earned += w.score ?? 0;
      entry.max += w.max_score ?? 0;
      byTitle.set(w.title, entry);
    }
    for (const [title, totals] of byTitle) {
      if (totals.max <= 0) continue;
      const ratio = totals.earned / totals.max;
      if (ratio >= 0.7 || out.filter((o) => o.kind === 'review').length >= 3) continue;
      out.push({
        userId,
        courseId: e.course_id,
        kind: 'review',
        title: `Review: ${title}`,
        reason: `Average quiz ratio ${ratio.toFixed(2)} is below 0.70 (rule-based).`,
        score: 0.8,
      });
    }
  }
  if (!out.length) {
    out.push({
      userId,
      courseId: null,
      kind: 'next',
      title: 'Browse the catalog for your next course',
      reason: 'No in-progress courses or weak quizzes detected.',
      score: 0.5,
    });
  }
  await db.query(`DELETE FROM recommendations WHERE user_id = $1`, [userId]);
  for (const r of out.slice(0, 10)) {
    await db.query(`INSERT INTO recommendations (id, user_id, course_id, kind, title, reason, score) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
      newId(),
      r.userId,
      r.courseId,
      r.kind,
      r.title,
      r.reason,
      r.score,
    ]);
  }
  return out.slice(0, 10);
}
