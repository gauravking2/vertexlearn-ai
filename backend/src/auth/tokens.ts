import jwt from 'jsonwebtoken';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ms = require('ms');
import { getConfig } from '../config';

export type RoleName = 'student' | 'instructor' | 'admin';

export interface AccessPayload {
  sub: string;
  email: string;
  roles: RoleName[];
  type: 'access';
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

export function signAccessToken(user: { id: string; email: string; roles: RoleName[] }): string {
  const { JWT_ACCESS_SECRET, JWT_ACCESS_TTL } = getConfig();
  return jwt.sign(
    { sub: user.id, email: user.email, roles: user.roles, type: 'access' } as AccessPayload,
    JWT_ACCESS_SECRET,
    { expiresIn: JWT_ACCESS_TTL as unknown as jwt.SignOptions['expiresIn'] },
  );
}

export function signRefreshToken(userId: string, jti: string): string {
  const { JWT_REFRESH_SECRET, JWT_REFRESH_TTL } = getConfig();
  return jwt.sign(
    { sub: userId, jti, type: 'refresh' } as RefreshPayload,
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_TTL as unknown as jwt.SignOptions['expiresIn'] },
  );
}

export function verifyAccessToken(token: string): AccessPayload {
  const { JWT_ACCESS_SECRET } = getConfig();
  const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as AccessPayload;
  if (decoded.type !== 'access') throw new Error('Not an access token');
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const { JWT_REFRESH_SECRET } = getConfig();
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as RefreshPayload;
  if (decoded.type !== 'refresh') throw new Error('Not a refresh token');
  return decoded;
}

export function refreshTtlMs(): number {
  const out = ms(getConfig().JWT_REFRESH_TTL as Parameters<typeof ms>[0]);
  if (typeof out !== 'number') throw new Error('Invalid JWT_REFRESH_TTL');
  return out;
}
