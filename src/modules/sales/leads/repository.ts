import { LeadStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import { AddFollowUpInput, CreateLeadInput, ListLeadsQuery } from './dto';

export const leadRepository = {
  async list(
    scopeWhere: { regionId?: string; ownerId?: string },
    filters: ListLeadsQuery,
  ) {
    const { page, pageSize, sortBy, sortOrder, status, source, productInterest, ownerId, search, dateFrom, dateTo } =
      filters;

    const where: Prisma.LeadWhereInput = { ...scopeWhere, deletedAt: null };
    if (status) where.status = status;
    if (source) where.source = source;
    if (productInterest) where.productInterest = { contains: productInterest, mode: 'insensitive' };
    // scopeWhere.ownerId means the caller is restricted to their own leads —
    // the ownerId filter must not be able to widen that back out.
    if (ownerId && !scopeWhere.ownerId) where.ownerId = ownerId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = dateFrom;
      if (dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = dateTo;
    }
    if (search) {
      where.OR = [
        { contactName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { contactPhone: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: { followUps: { orderBy: { createdAt: 'desc' }, take: 5 } },
        // Tiebreaker keeps pagination deterministic across identical requests
        // when bulk-seeded rows share the same createdAt.
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      prisma.lead.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async statusSummary(scopeWhere: { regionId?: string; ownerId?: string }, ownerId?: string) {
    const where: Prisma.LeadWhereInput = { ...scopeWhere, deletedAt: null };
    // Same override guard as list(): an owner-scoped caller can't widen past their own leads.
    if (ownerId && !scopeWhere.ownerId) where.ownerId = ownerId;

    const grouped = await prisma.lead.groupBy({ by: ['status'], where, _count: { _all: true } });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
  },

  findById(id: string) {
    return prisma.lead.findFirst({
      where: { id, deletedAt: null },
      include: { followUps: { orderBy: { createdAt: 'desc' } }, opportunity: true },
    });
  },

  findDuplicates(regionId: string, phone?: string, email?: string) {
    if (!phone && !email) return Promise.resolve([]);
    return prisma.lead.findMany({
      where: {
        regionId,
        deletedAt: null,
        OR: [phone ? { contactPhone: phone } : undefined, email ? { contactEmail: email } : undefined].filter(
          Boolean,
        ) as object[],
      },
    });
  },

  async nextRefNo(regionCode: string, regionId: string) {
    const count = await prisma.lead.count({ where: { regionId } });
    return `${regionCode}-L-${String(count + 1).padStart(6, '0')}`;
  },

  create(data: CreateLeadInput & { id: string; refNo: string; regionId: string; ownerId: string; createdBy: string }) {
    return prisma.lead.create({
      data: {
        id: data.id,
        refNo: data.refNo,
        contactName: data.contactName,
        companyName: data.companyName,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        address: data.address,
        gpsLatitude: data.gpsLatitude,
        gpsLongitude: data.gpsLongitude,
        visitLocation: data.visitLocation,
        source: data.source,
        sourceOther: data.sourceOther,
        productInterest: data.productInterest,
        productInterestOther: data.productInterestOther,
        notes: data.notes,
        regionId: data.regionId,
        ownerId: data.ownerId,
        createdBy: data.createdBy,
      },
    });
  },

  addFollowUp(leadId: string, input: AddFollowUpInput & { createdBy: string }) {
    return prisma.leadFollowUp.create({
      data: {
        leadId,
        note: input.note,
        channel: input.channel,
        nextActionAt: input.nextActionAt,
        createdBy: input.createdBy,
      },
    });
  },

  markStatus(id: string, status: LeadStatus, lostReason?: string) {
    return prisma.lead.update({ where: { id }, data: { status, lostReason } });
  },
};
