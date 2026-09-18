import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
  (req as unknown as { requestId?: string }).requestId = requestId;
  res.setHeader('x-request-id', requestId);
  const started = Date.now();
  res.on('finish', () => {
    logger.info(
      {
        requestId,
        service: 'vertexlearn-backend',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - started,
      },
      'request',
    );
  });
  next();
}
