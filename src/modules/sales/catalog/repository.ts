import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import { CreateCatalogItemInput, CreatePriceRuleInput, ListCatalogItemsQuery, UpdateCatalogItemInput } from './dto';

export const catalogRepository = {
  async listItems(filters: ListCatalogItemsQuery) {
    const { page, pageSize, sortBy, sortOrder, category, taxClass, active, search } = filters;

    const where: Prisma.CatalogItemWhereInput = { deletedAt: null };
    if (category) where.category = category;
    if (taxClass) where.taxClass = taxClass;
    if (active !== undefined) where.active = active;
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.catalogItem.findMany({
        where,
        // Tiebreaker keeps pagination deterministic across identical requests
        // when bulk-seeded rows share the same createdAt.
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      prisma.catalogItem.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  findItemById(id: string) {
    return prisma.catalogItem.findFirst({ where: { id, deletedAt: null } });
  },

  findItemByCode(code: string) {
    return prisma.catalogItem.findUnique({ where: { code } });
  },

  createItem(input: CreateCatalogItemInput & { id: string }) {
    return prisma.catalogItem.create({ data: input });
  },

  updateItem(id: string, input: UpdateCatalogItemInput) {
    return prisma.catalogItem.update({ where: { id }, data: input });
  },

  createPriceRule(input: CreatePriceRuleInput) {
    return prisma.priceRule.create({ data: input });
  },

  // Rules active "now" (or at a given date) for an item, optionally scoped to a region.
  listActivePriceRules(catalogItemId: string, regionId: string | undefined, at: Date) {
    return prisma.priceRule.findMany({
      where: {
        catalogItemId,
        OR: [{ regionId: null }, { regionId }],
        effectiveFrom: { lte: at },
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  },
};
