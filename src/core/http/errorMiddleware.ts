import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { logger } from '../logger/logger';

export function notFoundMiddleware(req: Request, res: Response) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.originalUrl}` } });
}

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: err.flatten() },
    });
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error({ err }, err.message);
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  logger.error({ err }, 'Unhandled error');
  const errAny = err as any;
  const prismaMsg = errAny?.message || String(err);
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : `Something went wrong: ${prismaMsg}`,
    },
  });
}
