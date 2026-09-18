import 'dotenv/config';
import { db, newId } from '../db/pool';
import { hashPassword } from '../auth/password';
import { logger } from '../logger';

async function ensureUser(email: string, name: string, password: string, role: string): Promise<void> {
  const existing = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);
  let userId: string;
  if (existing.rowCount) {
    userId = (existing.rows[0] as { id: string }).id;
  } else {
    userId = newId();
    await db.query(`INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)`, [
      userId,
      email,
      await hashPassword(password),
      name,
    ]);
  }
  const roleRow = await db.query(`SELECT id FROM roles WHERE name = $1`, [role]);
  const roleId = (roleRow.rows[0] as { id: string } | undefined)?.id;
  if (!roleId) throw new Error(`role ${role} missing — run migrations first`);
  await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, roleId]);
}

async function main(): Promise<void> {
  const demoPassword = process.env.DEMO_PASSWORD ?? 'ChangeMe123!';
  await ensureUser(process.env.DEMO_ADMIN_EMAIL ?? 'admin@example.com', 'Demo Admin', demoPassword, 'admin');
  await ensureUser(process.env.DEMO_INSTRUCTOR_EMAIL ?? 'instructor@example.com', 'Demo Instructor', demoPassword, 'instructor');
  await ensureUser(process.env.DEMO_STUDENT_EMAIL ?? 'student@example.com', 'Demo Student', demoPassword, 'student');
  logger.info('seed complete');
}

void main().catch((err) => {
  logger.error({ err }, 'seed failed');
  process.exitCode = 1;
});
