import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../errors';
import { verifyAccessToken, type RoleName } from './tokens';

export interface AuthUser {
  id: string;
  email: string;
  roles: RoleName[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized('Missing or invalid authorization header'));
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    req.user = { id: payload.sub, email: payload.email, roles: payload.roles };
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}

export function authorize(...allowed: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      next(unauthorized());
      return;
    }
    const ok = user.roles.some((r) => allowed.includes(r));
    if (!ok) {
      next(forbidden());
      return;
    }
    next();
  };
}
