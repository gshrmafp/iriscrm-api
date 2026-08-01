import { DepartmentMemberRole, Prisma } from '@prisma/client';
import { prisma } from '../../core/db/prisma';
import { CreateDepartmentInput, UpdateDepartmentInput } from './dto';

export const departmentRepository = {
  list(where: Prisma.DepartmentWhereInput) {
    return prisma.department.findMany({
      where: { ...where, deletedAt: null, active: true },
      orderBy: { name: 'asc' },
    });
  },

  findById(id: string) {
    return prisma.department.findFirst({
      where: { id, deletedAt: null },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
  },

  create(input: CreateDepartmentInput) {
    return prisma.department.create({ data: input });
  },

  update(id: string, input: UpdateDepartmentInput) {
    return prisma.department.update({ where: { id }, data: input });
  },

  addMember(departmentId: string, userId: string, roleInDept: DepartmentMemberRole) {
    return prisma.departmentMember.upsert({
      where: { departmentId_userId: { departmentId, userId } },
      create: { departmentId, userId, roleInDept },
      update: { roleInDept },
    });
  },

  removeMember(departmentId: string, userId: string) {
    return prisma.departmentMember.delete({
      where: { departmentId_userId: { departmentId, userId } },
    });
  },

  findMembership(departmentId: string, userId: string) {
    return prisma.departmentMember.findUnique({
      where: { departmentId_userId: { departmentId, userId } },
    });
  },

  async listMemberDepartmentIds(userId: string) {
    const rows = await prisma.departmentMember.findMany({ where: { userId }, select: { departmentId: true } });
    return rows.map((r) => r.departmentId);
  },

  async listMemberUserIds(departmentId: string) {
    const rows = await prisma.departmentMember.findMany({ where: { departmentId }, select: { userId: true } });
    return rows.map((r) => r.userId);
  },
};
