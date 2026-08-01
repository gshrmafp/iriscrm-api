import { Role } from '@prisma/client';
import { prisma } from './src/core/db/prisma';
import { ROLE_DEFAULT_PERMISSIONS } from './src/config/permissions';

async function main() {
  const roles: Role[] = [Role.SUPER_ADMIN, Role.REGIONAL_ADMIN, Role.SALES_MANAGER, Role.SALES_EXECUTIVE, Role.AUDITOR];
  for (const role of roles) {
    const perms = ROLE_DEFAULT_PERMISSIONS[role] || [];
    for (const permissionKey of perms) {
      await prisma.rolePermission.upsert({
        where: { role_permissionKey: { role, permissionKey } },
        create: { role, permissionKey },
        update: {},
      });
    }
    console.log(`Upserted ${perms.length} permissions for role ${role}`);
  }
  console.log('Done');
}
main().catch(console.error).finally(() => prisma.$disconnect());
