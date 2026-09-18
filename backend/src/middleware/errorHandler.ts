import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../errors';
import { logger } from '../logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = res.getHeader('x-request-id') ?? (req as unknown as { requestId?: string }).requestId;
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (err instanceof ApiError) {
    logger.warn({ err: { code: err.code, status: err.status }, requestId, path: req.path }, 'request error');
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  logger.error({ err, requestId, path: req.path, method: req.method }, 'unhandled error');
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
}
