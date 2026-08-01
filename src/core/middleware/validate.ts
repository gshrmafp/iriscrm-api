import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

// Parses+validates req.body against a zod schema and replaces it with the parsed
// (typed, defaulted) value. Validation failures throw ZodError, caught by errorMiddleware.
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.query = schema.parse(req.query);
    next();
  };
}
