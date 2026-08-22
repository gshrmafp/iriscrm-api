import { Prisma } from '@prisma/client';
import { prisma } from '../../core/db/prisma';
import { CreateCustomerInput, ListCustomersQuery } from './dto';

export const customerRepository = {
  async list(scopeWhere: { regionId?: string }, filters: ListCustomersQuery) {
    const { page, pageSize, sortBy, sortOrder, search, active } = filters;

    const where: Prisma.CustomerWhereInput = { ...scopeWhere, deletedAt: null };
    if (active !== undefined) where.active = active;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        // Tiebreaker keeps pagination deterministic when rows share a createdAt.
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      prisma.customer.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  findById(id: string) {
    return prisma.customer.findFirst({ where: { id, deletedAt: null } });
  },

  findDuplicateByName(regionId: string, name: string) {
    return prisma.customer.findFirst({ where: { regionId, deletedAt: null, name: { equals: name, mode: 'insensitive' } } });
  },

  create(data: CreateCustomerInput & { id: string; regionId: string; createdBy: string }) {
    return prisma.customer.create({
      data: {
        id: data.id,
        name: data.name,
        type: data.type,
        contacts: data.contacts,
        addresses: data.addresses,
        regionId: data.regionId,
        createdBy: data.createdBy,
      },
    });
  },
};
