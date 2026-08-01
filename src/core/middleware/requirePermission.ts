import { NextFunction, Request, Response } from 'express';
import { PermissionKey } from '../../config/permissions';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';
import { getEffectivePermissions } from '../rbac/effectivePermissions';
import { asyncHandler } from '../http/asyncHandler';

// Gate a route on one effective permission key. Must run after requireAuth.
export function requirePermission(permissionKey: PermissionKey) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();

    const effective = await getEffectivePermissions(req.user.id, req.user.role);
    if (!effective.has(permissionKey)) {
      throw new ForbiddenError(`Missing permission: ${permissionKey}`);
    }
    next();
  });
}
