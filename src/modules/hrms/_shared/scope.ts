import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import { AuthUser } from '../../../core/middleware/types';
import { CROSS_REGION_ROLES, PERMISSIONS } from '../../../config/permissions';
import { getEffectivePermissions } from '../../../core/rbac/effectivePermissions';

// Which employees an actor may see. Every HR read must go through this — the
// UI hides things too, but this is the actual boundary.
//   Super Admin                         → everyone
//   HR managers (hr.employee.manage), Regional Admin → their own region
//   everyone else                       → themselves + their whole reporting tree
export type HrScope =
  | { kind: 'all' }
  | { kind: 'region'; regionId: string }
  | { kind: 'tree'; userIds: string[] };

const MAX_TREE_DEPTH = 10;

export async function reportingTreeUserIds(managerId: string): Promise<string[]> {
  const ids = [managerId];
  let frontier = [managerId];
  for (let depth = 0; depth < MAX_TREE_DEPTH && frontier.length > 0; depth++) {
    const rows = await prisma.user.findMany({
      where: { reportingToId: { in: frontier } },
      select: { id: true },
    });
    frontier = rows.map((r) => r.id).filter((id) => !ids.includes(id));
    ids.push(...frontier);
  }
  return ids;
}

export async function resolveHrScope(actor: AuthUser): Promise<HrScope> {
  if (CROSS_REGION_ROLES.includes(actor.role)) return { kind: 'all' };
  const permissions = await getEffectivePermissions(actor.id, actor.role);
  if (permissions.has(PERMISSIONS.HR_EMPLOYEE_MANAGE) || actor.role === Role.REGIONAL_ADMIN) {
    return { kind: 'region', regionId: actor.regionId };
  }
  return { kind: 'tree', userIds: await reportingTreeUserIds(actor.id) };
}

export function employeeWhereForScope(scope: HrScope): Prisma.EmployeeWhereInput {
  if (scope.kind === 'all') return {};
  if (scope.kind === 'region') return { user: { regionId: scope.regionId } };
  return { userId: { in: scope.userIds } };
}

export function scopeIncludes(scope: HrScope, target: { userId: string; regionId: string }): boolean {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'region') return scope.regionId === target.regionId;
  return scope.userIds.includes(target.userId);
}

// HR administration (editing records, statutory data, documents of others) is
// narrower than visibility: managers can see their team but not edit it.
export async function resolveHrManageScope(actor: AuthUser): Promise<HrScope | null> {
  const permissions = await getEffectivePermissions(actor.id, actor.role);
  if (!permissions.has(PERMISSIONS.HR_EMPLOYEE_MANAGE)) return null;
  if (CROSS_REGION_ROLES.includes(actor.role)) return { kind: 'all' };
  return { kind: 'region', regionId: actor.regionId };
}
