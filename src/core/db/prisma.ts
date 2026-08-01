import { PrismaClient } from '@prisma/client';

// Single shared Prisma client — every module's repository imports this instance.
export const prisma = new PrismaClient();
