import { db, newId } from '../db/pool';

export interface NotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

/** Create an in-app notification. Best-effort: never throws for missing tables. */
export async function createNotification(input: NotificationInput): Promise<string | null> {
  try {
    const id = newId();
    await db.query(
      `INSERT INTO notifications (id, user_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, input.userId, input.type, input.title, input.body ?? '', input.link ?? ''],
    );
    return id;
  } catch {
    return null;
  }
}

export async function notifyEnrolledStudents(
  courseId: string,
  build: (userId: string) => Omit<NotificationInput, 'userId'>,
  excludeUserId?: string,
): Promise<number> {
  try {
    const res = await db.query(`SELECT user_id FROM enrollments WHERE course_id = $1`, [courseId]);
    let count = 0;
    for (const row of res.rows as { user_id: string }[]) {
      if (excludeUserId && row.user_id === excludeUserId) continue;
      const n = build(row.user_id);
      const id = await createNotification({ ...n, userId: row.user_id });
      if (id) count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}
