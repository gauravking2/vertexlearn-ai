import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authRouter } from './auth/routes';
import { getConfig } from './config';
import { coursesRouter } from './courses/routes';
import { aiRouter } from './ai/routes';
import { adminRouter } from './admin/routes';
import { announcementsRouter } from './announcements/routes';
import { discussionsRouter } from './discussions/routes';
import { notificationsRouter } from './notifications/routes';
import { storageRouter } from './storage/routes';
import { courseStatusUpdateHook, learningRouter } from './learning/routes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { authRateLimit } from './middleware/rateLimit';
import { opsRouter } from './ops/routes';

export function createApp(): express.Express {
  const config = getConfig();
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  // FRONTEND_URL is the browser origin allow-list (exact Origin match:
  // scheme + host, never a subpath — the Pages /vertexlearn-ai subpath is a
  // Router basename, not part of the Origin header). A single origin is the
  // norm; a comma-separated list is accepted for transition windows.
  // Any entry carrying a path (e.g. .../vertexlearn-ai) is normalized to its
  // bare origin so a path-suffixed value can never silently break CORS and
  // surface in the browser only as "Network Error".
  const allowedOrigins = config.FRONTEND_URL.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        const u = new URL(s);
        return `${u.protocol}//${u.host}`;
      } catch {
        return s.replace(/\/$/, '');
      }
    });
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);
  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined ? 10000 : config.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use('/', opsRouter);
  // Phase 7 PRD limits: auth 10/min/IP (scoped below), AI 20/min/user
  // (scoped inside aiRouter), other endpoints 100/min via the global
  // backstop (env-tunable, bypassed to 10000 in tests).
  app.use('/api/v1/auth', authRateLimit());
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/courses', coursesRouter);
  app.use('/api/v1', courseStatusUpdateHook());
  app.use('/api/v1', adminRouter);
  app.use('/api/v1', discussionsRouter);
  app.use('/api/v1', announcementsRouter);
  app.use('/api/v1', notificationsRouter);
  app.use('/api/v1', storageRouter);
  app.use('/api/v1', learningRouter);
  app.use('/api/v1', aiRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
