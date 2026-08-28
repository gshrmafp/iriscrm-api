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
    // Cheap single-query "last activity" signal (most recent linked Lead's
    // updatedAt) rather than an N+1 per row — the mobile client derives a
    // real, honest recency badge from this instead of a stored/subjective
    // "health" field.
    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: { leads: { orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } } },
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
        revenue: data.revenue,
        contacts: data.contacts,
        addresses: data.addresses,
        regionId: data.regionId,
        createdBy: data.createdBy,
      },
    });
  },

  // Powers the mobile Home dashboard's "Customers" tile — total + a real,
  // createdAt-derived "new this month" count (no fabricated trend %).
  async summary(scopeWhere: { regionId?: string }) {
    const where: Prisma.CustomerWhereInput = { ...scopeWhere, deletedAt: null };
    const startOfThisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [total, newThisMonth] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.count({ where: { ...where, createdAt: { gte: startOfThisMonth } } }),
    ]);

    return { total, newThisMonth };
  },
};
