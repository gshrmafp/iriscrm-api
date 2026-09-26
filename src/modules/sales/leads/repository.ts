import { LeadStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import { AddFollowUpInput, AddMeetingInput, ListLeadFollowUpsQuery, ListLeadsQuery, SaveStep1Input } from './dto';

export const leadRepository = {
  async list(
    scopeWhere: { regionId?: string; ownerId?: string },
    filters: ListLeadsQuery,
  ) {
    const {
      page,
      pageSize,
      sortBy,
      sortOrder,
      status,
      opportunityStage,
      ownerId,
      search,
      dateFrom,
      dateTo,
    } = filters;

    const where: Prisma.LeadWhereInput = { ...scopeWhere, deletedAt: null };
    if (status) where.status = status;
    if (opportunityStage) where.opportunity = { is: { stage: opportunityStage } };
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
        include: {
          followUps: { orderBy: { createdAt: 'desc' }, take: 5 },
          meetings: { orderBy: { createdAt: 'desc' }, take: 5 },
          opportunity: { select: { id: true, value: true, stage: true } },
        },
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
      include: {
        followUps: { orderBy: { createdAt: 'desc' } },
        meetings: { orderBy: { createdAt: 'desc' } },
        opportunity: { include: { stageHistory: { orderBy: { createdAt: 'asc' } } } },
      },
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

  addFollowUp(leadId: string, input: AddFollowUpInput & { loggedAtStage?: string; createdBy: string }) {
    return prisma.leadFollowUp.create({
      data: {
        leadId,
        note: input.note,
        channel: input.channel,
        nextActionAt: input.nextActionAt,
        priority: input.priority ?? 'MEDIUM',
        loggedAtStage: input.loggedAtStage,
        createdBy: input.createdBy,
      },
    });
  },

  addMeeting(leadId: string, input: AddMeetingInput & { loggedAtStage?: string; createdBy: string }) {
    return prisma.leadMeeting.create({
      data: {
        leadId,
        note: input.note,
        gpsLatitude: input.gpsLatitude,
        gpsLongitude: input.gpsLongitude,
        visitLocation: input.visitLocation,
        loggedAtStage: input.loggedAtStage,
        createdBy: input.createdBy,
      },
    });
  },

  findFollowUpById(id: string) {
    return prisma.leadFollowUp.findUnique({ where: { id }, include: { lead: true } });
  },

  completeFollowUp(id: string) {
    return prisma.leadFollowUp.update({ where: { id }, data: { completedAt: new Date() } });
  },

  markStatus(id: string, status: LeadStatus, lostReason?: string) {
    return prisma.lead.update({ where: { id }, data: { status, lostReason } });
  },

  // Flat, cross-lead follow-up feed — powers the mobile Activities tab.
  // nextActionAt nulls sort last since a follow-up with no reminder isn't
  // "due" anything; within that, newest-logged first.
  async listFollowUps(scopeWhere: { regionId?: string; ownerId?: string }, filters: ListLeadFollowUpsQuery) {
    const { page, pageSize, ownerId, completed } = filters;
    const leadWhere: Prisma.LeadWhereInput = { ...scopeWhere, deletedAt: null };
    if (ownerId && !scopeWhere.ownerId) leadWhere.ownerId = ownerId;

    const where: Prisma.LeadFollowUpWhereInput = { lead: leadWhere };
    if (completed !== undefined) where.completedAt = completed ? { not: null } : null;
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.leadFollowUp.findMany({
        where,
        include: { lead: { select: { id: true, refNo: true, contactName: true, companyName: true } } },
        orderBy: [{ nextActionAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      prisma.leadFollowUp.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  // Powers the mobile Home dashboard's "Active leads" tile. "Needs attention"
  // is a real, derived signal (no follow-up logged in the last 3 days) rather
  // than a stored/subjective field — every lead with zero follow-ups counts too.
  async dashboardSummary(scopeWhere: { regionId?: string; ownerId?: string }, ownerId?: string) {
    const where: Prisma.LeadWhereInput = { ...scopeWhere, deletedAt: null, status: { not: 'LOST' } };
    if (ownerId && !scopeWhere.ownerId) where.ownerId = ownerId;

    const activeLeads = await prisma.lead.findMany({
      where,
      select: { followUps: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } },
    });

    const STALE_MS = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const needAttentionCount = activeLeads.filter((lead) => {
      const lastFollowUp = lead.followUps[0];
      return !lastFollowUp || now - lastFollowUp.createdAt.getTime() > STALE_MS;
    }).length;

    return { activeCount: activeLeads.length, needAttentionCount };
  },

  // ---------- Stepped lead creation ----------

  async nextSteppedRefNo(regionCode: string) {
    const seqKey = `LEAD_REF_${regionCode}`;
    const seq = await prisma.$transaction(async (tx) => {
      return tx.sequence.upsert({
        where: { id: seqKey },
        update: { nextValue: { increment: 1 } },
        create: { id: seqKey, nextValue: 2 },
      });
    });
    return `${regionCode}${seq.nextValue - 1}`;
  },

  createStepped(data: SaveStep1Input & { id: string; refNo: string; regionId: string; ownerId: string; createdBy: string }) {
    return prisma.lead.create({
      data: {
        id: data.id,
        refNo: data.refNo,
        companyName: data.companyName,
        gpsLatitude: data.gpsLatitude,
        gpsLongitude: data.gpsLongitude,
        visitLocation: data.visitLocation,
        remarks: data.remarks,
        currentStep: 1,
        step1CompletedAt: new Date(),
        regionId: data.regionId,
        ownerId: data.ownerId,
        createdBy: data.createdBy,
      },
    });
  },

  updateStep2(id: string, data: { contactName: string; contactPhone?: string; contactEmail?: string; discussionNote?: string }) {
    return prisma.lead.update({
      where: { id },
      data: {
        contactName: data.contactName,
        contactPhone: data.contactPhone || null,
        contactEmail: data.contactEmail || null,
        discussionNote: data.discussionNote,
        currentStep: 2,
        step2CompletedAt: new Date(),
      },
    });
  },

  updateStep3(id: string, data: { status: LeadStatus; lostReason?: string; qualificationPath: string }) {
    return prisma.lead.update({
      where: { id },
      data: {
        status: data.status,
        lostReason: data.lostReason,
        qualificationPath: data.qualificationPath,
        currentStep: 3,
        step3CompletedAt: new Date(),
      },
    });
  },
};
