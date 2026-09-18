import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from './middleware';
import { getMe, loginUser, registerUser, rotateRefreshToken, revokeRefreshToken } from './service';
import { validateBody } from '../middleware/validate';

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
  role: z.enum(['student', 'instructor', 'admin']).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const user = await registerUser(req.body);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const out = await loginUser(req.body);
    res.json(out);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', validateBody(refreshSchema), async (req, res, next) => {
  try {
    const out = await rotateRefreshToken(req.body.refreshToken);
    res.json(out);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', validateBody(refreshSchema), async (req, res, next) => {
  try {
    await revokeRefreshToken(req.body.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    res.json({ user: await getMe(req.user!.id) });
  } catch (err) {
    next(err);
  }
});
