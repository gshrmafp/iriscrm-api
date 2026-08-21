import { PermissionEffect, Prisma, Role, UserStatus } from '@prisma/client';
import { prisma } from '../../core/db/prisma';
import { CreateUserInput, ListUsersQuery, UpdateUserInput } from './dto';

export const identityRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  createUser(input: CreateUserInput & { id: string, passwordHash: string }) {
    return prisma.user.create({
      data: {
        id: input.id,
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
        regionId: input.regionId,
        reportingToId: input.reportingToId,
      },
    });
  },

  // Unpaginated — backs the /users/directory teammate-lookup endpoint
  // (mentions, assignment pickers), which only ever wants active users.
  listUsers(where: { regionId?: string; status?: 'ACTIVE' | 'INACTIVE' }) {
    return prisma.user.findMany({
      where: { ...where, status: 'ACTIVE' },
      select: { id: true, name: true, email: true, role: true, regionId: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  async listUsersPaginated(scopeWhere: { regionId?: string }, filters: ListUsersQuery) {
    const { page, pageSize, sortBy, sortOrder, role, regionId, status, search } = filters;

    const where: Prisma.UserWhereInput = { ...scopeWhere };
    if (role) where.role = role;
    // scopeWhere.regionId means the caller is restricted to their own region —
    // the regionId filter must not be able to widen that back out.
    if (regionId && !scopeWhere.regionId) where.regionId = regionId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, role: true, regionId: true, status: true, createdAt: true },
        // A secondary tiebreaker keeps pagination deterministic: bulk-seeded
        // rows can share the exact same createdAt, and without a unique
        // secondary key, row order across identical requests isn't guaranteed.
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async listDirectReportIds(managerId: string) {
    const rows = await prisma.user.findMany({ where: { reportingToId: managerId }, select: { id: true } });
    return rows.map((r) => r.id);
  },

  listOverridesForUser(userId: string) {
    return prisma.userPermissionOverride.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  },

  upsertOverride(params: {
    userId: string;
    permissionKey: string;
    effect: PermissionEffect;
    grantedById: string;
    reason?: string;
    expiresAt?: Date;
  }) {
    return prisma.userPermissionOverride.upsert({
      where: { userId_permissionKey: { userId: params.userId, permissionKey: params.permissionKey } },
      create: params,
      update: {
        effect: params.effect,
        grantedById: params.grantedById,
        reason: params.reason,
        expiresAt: params.expiresAt,
      },
    });
  },

  deleteOverride(userId: string, permissionKey: string) {
    return prisma.userPermissionOverride.delete({
      where: { userId_permissionKey: { userId, permissionKey } },
    });
  },

  findRegionById(id: string) {
    return prisma.region.findUnique({ where: { id } });
  },

  listRegions() {
    return prisma.region.findMany({ orderBy: { code: 'asc' } });
  },

  createRegion(input: { code: string; name: string }) {
    return prisma.region.create({ data: input });
  },

  updateRegion(id: string, data: { active: boolean }) {
    return prisma.region.update({ where: { id }, data });
  },

  updateUserStatus(id: string, status: UserStatus) {
    return prisma.user.update({ where: { id }, data: { status } });
  },

  updateUser(id: string, data: UpdateUserInput) {
    return prisma.user.update({ where: { id }, data });
  },
};

export type IdentityRole = Role;
