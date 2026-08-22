import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../db/prisma';
import { AccountInactiveError, RegionInactiveError, UnauthorizedError } from '../errors/AppError';
import { CROSS_REGION_ROLES } from '../../config/permissions';
import { asyncHandler } from '../http/asyncHandler';
import './types';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  regionId: string;
}

// Re-checks the user's live status and their region's active flag against
// the DB on every request (not just at login/refresh) — a JWT alone can't
// reflect an account or region being deactivated mid-session, and this app
// has no push/session-revocation channel, so a per-request DB check is what
// makes deactivation take effect on the very next call instead of only once
// the (short-lived) access token naturally expires. Super Admins are exempt
// from the region check — otherwise deactivating the region a Super Admin
// happens to belong to could lock out the only role able to reactivate it.
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing bearer token');
  }

  const token = header.slice('Bearer '.length);

  let payload: AccessTokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { status: true, region: { select: { active: true } } },
  });
  if (!user || user.status !== 'ACTIVE') {
    throw new AccountInactiveError();
  }
  if (!user.region?.active && !CROSS_REGION_ROLES.includes(payload.role)) {
    throw new RegionInactiveError();
  }

  req.user = { id: payload.sub, role: payload.role, regionId: payload.regionId };
  next();
});
