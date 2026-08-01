import argon2 from 'argon2';
import { DepartmentMemberRole, Role } from '@prisma/client';
import { prisma } from '../src/core/db/prisma';
import { ROLE_DEFAULT_PERMISSIONS } from '../src/config/permissions';
import { generateId } from '../src/core/utils/idGenerator';

let seeded = false;

// Ensures RolePermission rows exist so requirePermission has something to read.
// Idempotent — safe to call from every test file's beforeAll.
export async function ensureRolePermissionsSeeded() {
  if (seeded) return;
  for (const role of Object.values(Role)) {
    for (const permissionKey of ROLE_DEFAULT_PERMISSIONS[role] ?? []) {
      await prisma.rolePermission.upsert({
        where: { role_permissionKey: { role, permissionKey } },
        update: {},
        create: { role, permissionKey },
      });
    }
  }
  seeded = true;
}

export async function createTestRegion(codePrefix: string) {
  const code = `${codePrefix}${Date.now().toString(36).slice(-4)}`.toUpperCase();
  return prisma.region.create({ data: { code, name: `Test Region ${code}` } });
}

export async function createTestUser(role: Role, regionId: string, emailPrefix = 'user') {
  const email = `${emailPrefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
  const password = 'TestPass123!';
  const passwordHash = await argon2.hash(password);
  const id = await generateId('USER');
  const user = await prisma.user.create({
    data: { id, name: emailPrefix, email, passwordHash, role, regionId },
  });
  return { user, password };
}

export async function cleanupIds(model: { deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<unknown> }, ids: string[]) {
  if (ids.length === 0) return;
  await model.deleteMany({ where: { id: { in: ids } } });
}

export async function createTestDepartment(regionId: string | null, codePrefix = 'DEPT') {
  const code = `${codePrefix}${Date.now().toString(36).slice(-4)}${Math.floor(Math.random() * 1e3)}`.toUpperCase();
  return prisma.department.create({ data: { code, name: `Test Department ${code}`, regionId } });
}

export async function addDepartmentMember(departmentId: string, userId: string, roleInDept: DepartmentMemberRole = DepartmentMemberRole.EMPLOYEE) {
  return prisma.departmentMember.create({ data: { departmentId, userId, roleInDept } });
}
