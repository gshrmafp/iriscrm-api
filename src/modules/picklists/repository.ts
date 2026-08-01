import { PicklistType } from '@prisma/client';
import { prisma } from '../../core/db/prisma';
import { CreatePicklistOptionInput, UpdatePicklistOptionInput } from './dto';

export const picklistRepository = {
  // Active-only, ordered — what every non-admin caller (e.g. the lead form) wants.
  listActive(listType: PicklistType) {
    return prisma.picklistOption.findMany({
      where: { listType, active: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  },

  // All options incl. inactive — for the admin management screen.
  listAll(listType: PicklistType) {
    return prisma.picklistOption.findMany({
      where: { listType },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  },

  findById(id: string) {
    return prisma.picklistOption.findUnique({ where: { id } });
  },

  findByCode(listType: PicklistType, code: string) {
    return prisma.picklistOption.findUnique({ where: { listType_code: { listType, code } } });
  },

  create(input: CreatePicklistOptionInput) {
    return prisma.picklistOption.create({ data: input });
  },

  update(id: string, input: UpdatePicklistOptionInput) {
    return prisma.picklistOption.update({ where: { id }, data: input });
  },
};
