import { Role } from '@prisma/client';
import { AuthUser } from '../middleware/types';
import { CROSS_REGION_ROLES } from '../../config/permissions';
import { ForbiddenError } from '../errors/AppError';

// Returns a Prisma `where` fragment that scopes a query to the caller's region,
// unless the caller's role is cross-region (Super Admin). Every repository
// list/get method should spread this into its where clause — this is the single
// place region isolation lives, so it can't be forgotten module-by-module.
export function regionScopeWhere(user: AuthUser): { regionId?: string } {
  if (CROSS_REGION_ROLES.includes(user.role as Role)) return {};
  return { regionId: user.regionId };
}

export function assertSameRegionOrElevated(user: AuthUser, resourceRegionId: string) {
  if (CROSS_REGION_ROLES.includes(user.role as Role)) return;
  if (user.regionId !== resourceRegionId) {
    throw new ForbiddenError('Resource belongs to a different region');
  }
}
