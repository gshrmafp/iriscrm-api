import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../src/config/env";
import { prisma } from "../src/core/db/prisma";

function signTestToken(user: { id: string; role: Role; regionId: string }) {
  return jwt.sign(
    { sub: user.id, role: user.role, regionId: user.regionId },
    env.JWT_ACCESS_SECRET,
    { expiresIn: "1h" },
  );
}

async function main() {
  const [
    superAdmin,
    ggnAdmin,
    ggnManager,
    ggnExec,
    ggnAuditor,
    dlAdmin,
    dlExec,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { email: "superadmin@iris.local" } }),
    prisma.user.findUnique({ where: { email: "priya.admin@iris.local" } }),
    prisma.user.findUnique({ where: { email: "vikram.manager@iris.local" } }),
    prisma.user.findUnique({ where: { email: "rahul.exec@iris.local" } }),
    prisma.user.findUnique({ where: { email: "anita.auditor@iris.local" } }),
    prisma.user.findUnique({ where: { email: "sanjay.admin@iris.local" } }),
    prisma.user.findUnique({ where: { email: "neha.exec@iris.local" } }),
  ]);

  const tokens: Record<string, string> = {};
  if (superAdmin)
    tokens.SUPER_ADMIN = signTestToken({
      id: superAdmin.id,
      role: superAdmin.role,
      regionId: superAdmin.regionId,
    });
  if (ggnAdmin)
    tokens.REGIONAL_ADMIN = signTestToken({
      id: ggnAdmin.id,
      role: ggnAdmin.role,
      regionId: ggnAdmin.regionId,
    });
  if (ggnManager)
    tokens.SALES_MANAGER = signTestToken({
      id: ggnManager.id,
      role: ggnManager.role,
      regionId: ggnManager.regionId,
    });
  if (ggnExec)
    tokens.SALES_EXECUTIVE = signTestToken({
      id: ggnExec.id,
      role: ggnExec.role,
      regionId: ggnExec.regionId,
    });
  if (ggnAuditor)
    tokens.AUDITOR = signTestToken({
      id: ggnAuditor.id,
      role: ggnAuditor.role,
      regionId: ggnAuditor.regionId,
    });
  if (dlAdmin)
    tokens.REGIONAL_ADMIN_DL = signTestToken({
      id: dlAdmin.id,
      role: dlAdmin.role,
      regionId: dlAdmin.regionId,
    });
  if (dlExec)
    tokens.SALES_EXECUTIVE_DL = signTestToken({
      id: dlExec.id,
      role: dlExec.role,
      regionId: dlExec.regionId,
    });

  const users: Record<
    string,
    { id: string; email: string; role: Role; regionId: string } | null
  > = {};
  if (superAdmin)
    users.SUPER_ADMIN = {
      id: superAdmin.id,
      email: superAdmin.email,
      role: superAdmin.role,
      regionId: superAdmin.regionId,
    };
  if (ggnAdmin)
    users.REGIONAL_ADMIN = {
      id: ggnAdmin.id,
      email: ggnAdmin.email,
      role: ggnAdmin.role,
      regionId: ggnAdmin.regionId,
    };
  if (ggnManager)
    users.SALES_MANAGER = {
      id: ggnManager.id,
      email: ggnManager.email,
      role: ggnManager.role,
      regionId: ggnManager.regionId,
    };
  if (ggnExec)
    users.SALES_EXECUTIVE = {
      id: ggnExec.id,
      email: ggnExec.email,
      role: ggnExec.role,
      regionId: ggnExec.regionId,
    };
  if (ggnAuditor)
    users.AUDITOR = {
      id: ggnAuditor.id,
      email: ggnAuditor.email,
      role: ggnAuditor.role,
      regionId: ggnAuditor.regionId,
    };
  if (dlAdmin)
    users.REGIONAL_ADMIN_DL = {
      id: dlAdmin.id,
      email: dlAdmin.email,
      role: dlAdmin.role,
      regionId: dlAdmin.regionId,
    };
  if (dlExec)
    users.SALES_EXECUTIVE_DL = {
      id: dlExec.id,
      email: dlExec.email,
      role: dlExec.role,
      regionId: dlExec.regionId,
    };

  console.log(JSON.stringify({ tokens, users }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
