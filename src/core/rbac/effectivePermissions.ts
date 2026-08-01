import { PermissionEffect, Role } from '@prisma/client';
import { prisma } from '../db/prisma';
import { ROLE_DEFAULT_PERMISSIONS } from '../../config/permissions';

/**
 * Resolves the effective permission set for a user:
 *   effective = roleDefaults(role)  →  minus DENY overrides  →  plus GRANT overrides
 *
 * DENY always beats a role default (admin can revoke one permission from one user
 * without touching their role). GRANT always beats absence (admin can hand a single
 * user an extra capability their role doesn't normally have). Expired overrides are
 * ignored. Role defaults come from RolePermission (DB, seeded from ROLE_DEFAULT_PERMISSIONS)
 * so they can be tuned per-deployment without a code change.
 */
export async function getEffectivePermissions(userId: string, role: Role): Promise<Set<string>> {
  const [rolePermissions, overrides] = await Promise.all([
    prisma.rolePermission.findMany({ where: { role }, select: { permissionKey: true } }),
    prisma.userPermissionOverride.findMany({
      where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { permissionKey: true, effect: true },
    }),
  ]);

  const effective = new Set(rolePermissions.map((p) => p.permissionKey));

  // Fall back to the in-code defaults if RolePermission hasn't been seeded yet.
  if (effective.size === 0) {
    for (const key of ROLE_DEFAULT_PERMISSIONS[role] ?? []) effective.add(key);
  }

  for (const override of overrides) {
    if (override.effect === PermissionEffect.DENY) effective.delete(override.permissionKey);
    else effective.add(override.permissionKey);
  }

  return effective;
}

export async function hasPermission(userId: string, role: Role, permissionKey: string): Promise<boolean> {
  const effective = await getEffectivePermissions(userId, role);
  return effective.has(permissionKey);
}
