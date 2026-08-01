import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../../config/env';
import { UnauthorizedError } from '../errors/AppError';
import './types';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  regionId: string;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing bearer token');
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    req.user = { id: payload.sub, role: payload.role, regionId: payload.regionId };
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
