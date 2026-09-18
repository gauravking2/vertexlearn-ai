import { newId, sha256, db } from '../db/pool';
import { hashPassword, verifyPassword } from './password';
import { refreshTtlMs, signAccessToken, signRefreshToken, verifyRefreshToken, type RoleName } from './tokens';
import { conflict, forbidden, notFound, unauthorized } from '../errors';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  roles: RoleName[];
}

async function rolesFor(userId: string): Promise<RoleName[]> {
  const res = await db.query(
    `SELECT r.name AS name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1 ORDER BY r.name`,
    [userId],
  );
  return res.rows.map((r) => r.name as RoleName);
}

export async function registerUser(input: { email: string; password: string; name: string; role?: RoleName }): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  const existing = await db.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rowCount) throw conflict('Email already registered');

  const role: RoleName = input.role ?? 'student';
  if (role === 'admin') throw conflict('Admin role cannot be self-registered');

  const id = newId();
  const passwordHash = await hashPassword(input.password);
  await db.query(`INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)`, [
    id,
    email,
    passwordHash,
    input.name.trim(),
  ]);
  const roleRow = await db.query(`SELECT id FROM roles WHERE name = $1`, [role]);
  const roleId = roleRow.rows[0]?.id as string;
  await db.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [id, roleId]);
  return { id, email, name: input.name.trim(), roles: [role] };
}

export async function loginUser(input: { email: string; password: string }): Promise<{
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}> {
  const email = input.email.trim().toLowerCase();
  let res;
  try {
    res = await db.query(`SELECT id, email, password_hash, name, is_suspended FROM users WHERE email = $1`, [email]);
  } catch {
    res = await db.query(`SELECT id, email, password_hash, name FROM users WHERE email = $1`, [email]);
  }
  const row = res.rows[0] as { id: string; email: string; password_hash: string; name: string; is_suspended?: boolean } | undefined;
  if (!row || !(await verifyPassword(input.password, row.password_hash as string))) {
    throw unauthorized('Invalid credentials');
  }
  if (row.is_suspended === true) {
    throw forbidden('Account is suspended');
  }
  const roles = await rolesFor(row.id);
  const accessToken = signAccessToken({ id: row.id, email: row.email, roles });
  const jti = newId();
  const refreshToken = signRefreshToken(row.id, jti);
  const expiresAt = new Date(Date.now() + refreshTtlMs()).toISOString();
  await db.query(`INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`, [
    jti,
    row.id,
    sha256(refreshToken),
    expiresAt,
  ]);
  return { user: { id: row.id, email: row.email, name: row.name, roles }, accessToken, refreshToken };
}

export async function rotateRefreshToken(token: string): Promise<{ accessToken: string; refreshToken: string }> {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw unauthorized('Invalid or expired refresh token');
  }
  const stored = await db.query(`SELECT user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1`, [
    sha256(token),
  ]);
  const row = stored.rows[0] as { user_id: string; expires_at: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
    throw unauthorized('Invalid or expired refresh token');
  }
  const userRes = await db.query(`SELECT id, email, name FROM users WHERE id = $1`, [payload.sub]);
  const user = userRes.rows[0] as { id: string; email: string; name: string } | undefined;
  if (!user) throw unauthorized('Invalid or expired refresh token');

  const roles = await rolesFor(user.id);
  await db.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`, [sha256(token)]);
  const jti = newId();
  const nextRefresh = signRefreshToken(user.id, jti);
  const expiresAt = new Date(Date.now() + refreshTtlMs()).toISOString();
  await db.query(`INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`, [
    jti,
    user.id,
    sha256(nextRefresh),
    expiresAt,
  ]);
  return { accessToken: signAccessToken({ id: user.id, email: user.email, roles }), refreshToken: nextRefresh };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await db.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [
    sha256(token),
  ]);
}

export async function getMe(userId: string): Promise<PublicUser> {
  const res = await db.query(`SELECT id, email, name FROM users WHERE id = $1`, [userId]);
  const row = res.rows[0] as { id: string; email: string; name: string } | undefined;
  if (!row) throw notFound('User not found');
  return { id: row.id, email: row.email, name: row.name, roles: await rolesFor(row.id) };
}
