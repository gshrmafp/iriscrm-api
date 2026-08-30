// One-off bootstrap script for a fresh production database: creates a
// starter Region (if none exists) and a SUPER_ADMIN user. Not part of the
// app's runtime — run once via `npx tsx create_admin.ts` after migrations
// and upsert_permissions.ts.
import argon2 from 'argon2';
import { Role } from '@prisma/client';
import { prisma } from './src/core/db/prisma';
import { generateId } from './src/core/utils/idGenerator';

const EMAIL = process.env.ADMIN_EMAIL || 'admin@iris.local';
const PASSWORD = process.env.ADMIN_PASSWORD;
const NAME = process.env.ADMIN_NAME || 'Super Admin';
const REGION_CODE = process.env.ADMIN_REGION_CODE || 'HQ';
const REGION_NAME = process.env.ADMIN_REGION_NAME || 'Headquarters';

async function main() {
  if (!PASSWORD) throw new Error('Set ADMIN_PASSWORD in the environment before running this script.');

  const region = await prisma.region.upsert({
    where: { code: REGION_CODE },
    update: {},
    create: { code: REGION_CODE, name: REGION_NAME },
  });

  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log(`User ${EMAIL} already exists (id ${existing.id}) — not creating a duplicate.`);
    return;
  }

  const passwordHash = await argon2.hash(PASSWORD);
  const id = await generateId('USER');
  const user = await prisma.user.create({
    data: { id, name: NAME, email: EMAIL, passwordHash, role: Role.SUPER_ADMIN, regionId: region.id },
  });

  console.log(`Created SUPER_ADMIN user ${user.email} (id ${user.id}) in region ${region.code}.`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => prisma.$disconnect());
