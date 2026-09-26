import { LeadStatus, OpportunityStage, Prisma } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import {
  AddFollowUpInput,
  AddMeetingInput,
  JourneySummaryQuery,
  LeadStageFilter,
  ListLeadFollowUpsQuery,
  ListLeadsQuery,
  SaveStep1Input,
  TeamPerformanceQuery,
  leadStageFilterValues,
} from './dto';

// Composite "Lead Journey" stage filter — see dto.ts's leadStageFilterValues.
// Shared by list() (the Leads-list dropdown) and journeySummary() (the
// Dashboard's per-stage counts + recent leads), so both agree on exactly
// what each of the 7 stages means.
function buildStageWhere(stage: LeadStageFilter): Prisma.LeadWhereInput {
  switch (stage) {
    case 'NEW_LEAD':
      return { status: 'NEW', currentStep: 1 };
    case 'CONTACTED':
      return { status: 'NEW', currentStep: { gte: 2 } };
    case 'QUALIFIED':
      return { status: 'QUALIFIED' };
    case 'QUOTATION':
      return { opportunity: { is: { stage: { in: ['QUOTATION', 'FOLLOWUP'] } } } };
    case 'MEETING':
      return { opportunity: { is: { stage: 'MEETING' } } };
    case 'PURCHASE_ORDER':
      return { opportunity: { is: { stage: 'PURCHASE_ORDER' } } };
    case 'LOST':
      return { OR: [{ status: 'LOST' }, { opportunity: { is: { stage: 'LOST' } } }] };
  }
}

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
      stage,
      ownerId,
      search,
      dateFrom,
      dateTo,
    } = filters;

    const where: Prisma.LeadWhereInput = { ...scopeWhere, deletedAt: null };
    const andConditions: Prisma.LeadWhereInput[] = [];

    if (status) where.status = status;
    if (opportunityStage) where.opportunity = { is: { stage: opportunityStage } };
    if (stage) {
      const stageWhere = buildStageWhere(stage);
      if (stage === 'LOST') andConditions.push(stageWhere);
      else Object.assign(where, stageWhere);
    }
    // scopeWhere.ownerId means the caller is restricted to their own leads —
    // the ownerId filter must not be able to widen that back out.
    if (ownerId && !scopeWhere.ownerId) where.ownerId = ownerId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = dateFrom;
      if (dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = dateTo;
    }
    if (search) {
      andConditions.push({
        OR: [
          { contactName: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
          { contactPhone: { contains: search, mode: 'insensitive' } },
          { contactEmail: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (andConditions.length) where.AND = andConditions;

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

  // Combined Lead+Opportunity "Lead Journey" breakdown for the Dashboard —
  // one count + a few recent leads per stage, using the same buildStageWhere()
  // as list() so the two features agree on what each stage means. Value sums
  // (only meaningful for the Opportunity-backed stages) come from a separate
  // groupBy since `value` lives on Opportunity, not Lead.
  async journeySummary(scopeWhere: { regionId?: string; ownerId?: string }, filters: JourneySummaryQuery) {
    const { ownerId, dateFrom, dateTo } = filters;

    const leadWhere: Prisma.LeadWhereInput = { ...scopeWhere, deletedAt: null };
    if (ownerId && !scopeWhere.ownerId) leadWhere.ownerId = ownerId;
    if (dateFrom || dateTo) {
      leadWhere.createdAt = {};
      if (dateFrom) (leadWhere.createdAt as Prisma.DateTimeFilter).gte = dateFrom;
      if (dateTo) (leadWhere.createdAt as Prisma.DateTimeFilter).lte = dateTo;
    }

    const oppWhere: Prisma.OpportunityWhereInput = { ...scopeWhere, deletedAt: null };
    if (ownerId && !scopeWhere.ownerId) oppWhere.ownerId = ownerId;
    if (dateFrom || dateTo) {
      oppWhere.createdAt = {};
      if (dateFrom) (oppWhere.createdAt as Prisma.DateTimeFilter).gte = dateFrom;
      if (dateTo) (oppWhere.createdAt as Prisma.DateTimeFilter).lte = dateTo;
    }

    const recentLeadSelect = {
      id: true,
      refNo: true,
      contactName: true,
      companyName: true,
      status: true,
      currentStep: true,
      updatedAt: true,
      opportunity: { select: { stage: true } },
    } satisfies Prisma.LeadSelect;

    const [oppGrouped, ...perStage] = await Promise.all([
      prisma.opportunity.groupBy({ by: ['stage'], where: oppWhere, _sum: { value: true } }),
      ...leadStageFilterValues.map((stage) => {
        const where: Prisma.LeadWhereInput = { ...leadWhere, ...buildStageWhere(stage) };
        return Promise.all([
          prisma.lead.count({ where }),
          prisma.lead.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 7, select: recentLeadSelect }),
        ]);
      }),
    ]);

    const valueByOppStage = new Map(oppGrouped.map((g) => [g.stage, Number(g._sum.value ?? 0)]));
    const VALUE_SOURCE: Partial<Record<LeadStageFilter, OpportunityStage[]>> = {
      QUOTATION: ['QUOTATION', 'FOLLOWUP'],
      MEETING: ['MEETING'],
      PURCHASE_ORDER: ['PURCHASE_ORDER'],
      LOST: ['LOST'],
    };

    const stages = leadStageFilterValues.map((stage, i) => {
      const [count, recentLeads] = perStage[i];
      const valueSources = VALUE_SOURCE[stage];
      const value = valueSources
        ? valueSources.reduce((sum, s) => sum + (valueByOppStage.get(s) ?? 0), 0)
        : undefined;
      return { stage, count, value, recentLeads };
    });

    // Qualified is a cumulative milestone (overlaps with Quotation/Meeting/PO/Lost
    // once an opportunity progresses) rather than a mutually-exclusive bucket —
    // excluded from the funnel total so it isn't double-counted.
    const total = stages.filter((s) => s.stage !== 'QUALIFIED').reduce((sum, s) => sum + s.count, 0);

    return { stages, total };
  },

  // Per-owner version of the same 7-stage breakdown, for the Dashboard's
  // Team performance table. Reuses buildStageWhere() so "status wise" here
  // means exactly the same 7 stages shown everywhere else in the app.
  async teamPerformance(scopeWhere: { regionId?: string; ownerId?: string }, filters: TeamPerformanceQuery) {
    const { dateFrom, dateTo } = filters;
    const leadWhere: Prisma.LeadWhereInput = { ...scopeWhere, deletedAt: null };
    if (dateFrom || dateTo) {
      leadWhere.createdAt = {};
      if (dateFrom) (leadWhere.createdAt as Prisma.DateTimeFilter).gte = dateFrom;
      if (dateTo) (leadWhere.createdAt as Prisma.DateTimeFilter).lte = dateTo;
    }

    const perStage = await Promise.all(
      leadStageFilterValues.map((stage) =>
        prisma.lead
          .groupBy({
            by: ['ownerId'],
            where: { ...leadWhere, ...buildStageWhere(stage) },
            _count: { _all: true },
          })
          .then((rows) => ({ stage, rows })),
      ),
    );

    const byOwner = new Map<string, Record<LeadStageFilter, number>>();
    for (const { stage, rows } of perStage) {
      for (const row of rows) {
        const counts = byOwner.get(row.ownerId) ?? ({} as Record<LeadStageFilter, number>);
        counts[stage] = row._count._all;
        byOwner.set(row.ownerId, counts);
      }
    }

    return Array.from(byOwner.entries()).map(([ownerId, counts]) => ({
      ownerId,
      counts: Object.fromEntries(
        leadStageFilterValues.map((stage) => [stage, counts[stage] ?? 0]),
      ) as Record<LeadStageFilter, number>,
    }));
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
