import { randomUUID } from 'node:crypto';
import { db, newId } from '../db/pool';

export function utcDateString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function recalculateCourseProgress(userId: string, courseId: string): Promise<number> {
  const totalRes = await db.query(
    `SELECT COUNT(*)::int AS count FROM lectures l JOIN modules m ON m.id = l.module_id WHERE m.course_id = $1`,
    [courseId],
  );
  const total = (totalRes.rows[0] as { count: number }).count;
  let percent = 0;
  if (total > 0) {
    const doneRes = await db.query(
      `SELECT COUNT(*)::int AS count FROM lecture_progress lp
       JOIN lectures l ON l.id = lp.lecture_id JOIN modules m ON m.id = l.module_id
       WHERE lp.user_id = $1 AND m.course_id = $2 AND lp.completed = true`,
      [userId, courseId],
    );
    const done = (doneRes.rows[0] as { count: number }).count;
    percent = Math.min(100, Math.round((done / total) * 100));
  } else {
    percent = 0;
  }
  const existing = await db.query(`SELECT id, completed_at FROM enrollments WHERE user_id = $1 AND course_id = $2`, [userId, courseId]);
  const row = existing.rows[0] as { id: string; completed_at: string | null } | undefined;
  if (row) {
    if (percent >= 100 && !row.completed_at) {
      await db.query(`UPDATE enrollments SET progress_percent = $1, completed_at = now(), updated_at = now() WHERE id = $2`, [percent, row.id]);
    } else if (percent < 100 && row.completed_at) {
      await db.query(`UPDATE enrollments SET progress_percent = $1, completed_at = NULL, updated_at = now() WHERE id = $2`, [percent, row.id]);
    } else {
      await db.query(`UPDATE enrollments SET progress_percent = $1, updated_at = now() WHERE id = $2`, [percent, row.id]);
    }
  }
  return percent;
}

export async function isCourseComplete(userId: string, courseId: string): Promise<boolean> {
  const res = await db.query(`SELECT completed_at, progress_percent FROM enrollments WHERE user_id = $1 AND course_id = $2`, [userId, courseId]);
  const row = res.rows[0] as { completed_at: string | null; progress_percent: number } | undefined;
  return Boolean(row && (row.completed_at || row.progress_percent >= 100));
}

export async function touchStreak(userId: string, activityDate = utcDateString()): Promise<{ current: number; awarded7Day: boolean }> {
  const res = await db.query(`SELECT current_streak_days, longest_streak_days, last_activity_date FROM streaks WHERE user_id = $1`, [userId]);
  const row = res.rows[0] as { current_streak_days: number; longest_streak_days: number; last_activity_date: string | Date | null } | undefined;
  const last = row?.last_activity_date ? new Date(row.last_activity_date).toISOString().slice(0, 10) : null;
  if (row && last === activityDate) {
    return { current: row.current_streak_days, awarded7Day: row.current_streak_days >= 7 };
  }
  let current = 1;
  if (row && last) {
    const diffDays = Math.round((new Date(activityDate).getTime() - new Date(last).getTime()) / 86400000);
    current = diffDays === 1 ? row.current_streak_days + 1 : 1;
  }
  const longest = Math.max(row?.longest_streak_days ?? 0, current);
  if (row) {
    await db.query(`UPDATE streaks SET current_streak_days = $1, longest_streak_days = $2, last_activity_date = $3, updated_at = now() WHERE user_id = $4`, [
      current,
      longest,
      activityDate,
      userId,
    ]);
  } else {
    await db.query(`INSERT INTO streaks (user_id, current_streak_days, longest_streak_days, last_activity_date) VALUES ($1, $2, $3, $4)`, [
      userId,
      current,
      longest,
      activityDate,
    ]);
  }
  if (current >= 7) {
    await awardBadge(userId, '7-day-streak', { streak_days: current });
    return { current, awarded7Day: true };
  }
  return { current, awarded7Day: false };
}

export async function awardBadge(userId: string, slug: string, metadata: Record<string, unknown> = {}): Promise<boolean> {
  const badge = await db.query(`SELECT id FROM badges WHERE slug = $1`, [slug]);
  const badgeId = (badge.rows[0] as { id: string } | undefined)?.id;
  if (!badgeId) return false;
  const existing = await db.query(`SELECT id FROM user_badges WHERE user_id = $1 AND badge_id = $2`, [userId, badgeId]);
  if (existing.rowCount) return false;
  await db.query(`INSERT INTO user_badges (id, user_id, badge_id, metadata) VALUES ($1, $2, $3, $4)`, [
    newId(),
    userId,
    badgeId,
    JSON.stringify(metadata),
  ]);
  return true;
}

export function certificateCode(): string {
  return `VL-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}
