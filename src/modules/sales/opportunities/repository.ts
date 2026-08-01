import { AmcFrequency, AmcType, DealType, OpportunityStage, Prisma } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import { ListOpportunitiesQuery, WinInput } from './dto';
import { STAGE_PROBABILITY } from './pipeline';

export const opportunityRepository = {
  async list(scopeWhere: { regionId?: string; ownerId?: string }, filters: ListOpportunitiesQuery) {
    const { page, pageSize, sortBy, sortOrder, stage, dealType, ownerId, dateFrom, dateTo } = filters;

    const where: Prisma.OpportunityWhereInput = { ...scopeWhere, deletedAt: null };
    if (stage) where.stage = stage;
    if (dealType) where.dealType = dealType;
    // scopeWhere.ownerId means the caller is restricted to their own opportunities —
    // the ownerId filter must not be able to widen that back out.
    if (ownerId && !scopeWhere.ownerId) where.ownerId = ownerId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = dateFrom;
      if (dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = dateTo;
    }

    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        include: { lead: true },
        // Tiebreaker keeps pagination deterministic across identical requests
        // when bulk-seeded rows share the same createdAt.
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        skip,
        take: pageSize,
      }),
      prisma.opportunity.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  // Per-stage counts/sums across ALL stages, plus pipeline value / weighted
  // forecast across the open (non-Won/Lost) subset — computed in the DB via
  // groupBy so the dashboard doesn't need to fetch every row to total them.
  async getPipelineSummary(scopeWhere: { regionId?: string; ownerId?: string }) {
    const where: Prisma.OpportunityWhereInput = { ...scopeWhere, deletedAt: null };

    const grouped = await prisma.opportunity.groupBy({
      by: ['stage'],
      where,
      _sum: { value: true },
      _count: true,
    });

    const byStageMap = new Map(grouped.map((g) => [g.stage, g]));
    const stages = Object.keys(STAGE_PROBABILITY) as OpportunityStage[];
    const byStage = stages.map((stage) => {
      const g = byStageMap.get(stage);
      return { stage, count: g?._count ?? 0, value: Number(g?._sum.value ?? 0) };
    });

    let openCount = 0;
    let pipelineValue = 0;
    let weightedForecast = 0;
    for (const s of byStage) {
      if (s.stage === OpportunityStage.WON || s.stage === OpportunityStage.LOST) continue;
      openCount += s.count;
      pipelineValue += s.value;
      weightedForecast += s.value * (STAGE_PROBABILITY[s.stage] / 100);
    }

    return { byStage, openCount, pipelineValue, weightedForecast };
  },

  findById(id: string) {
    return prisma.opportunity.findFirst({
      where: { id, deletedAt: null },
      include: { lead: true, stageHistory: { orderBy: { createdAt: 'desc' } }, quotations: true },
    });
  },

  createFromLead(input: {
    leadId: string;
    dealType: DealType;
    value: number;
    expectedClose?: Date;
    regionId: string;
    ownerId: string;
    createdBy: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.create({
        data: {
          leadId: input.leadId,
          dealType: input.dealType,
          value: input.value,
          expectedClose: input.expectedClose,
          regionId: input.regionId,
          ownerId: input.ownerId,
          createdBy: input.createdBy,
          probability: STAGE_PROBABILITY.NEW,
        },
      });
      await tx.opportunityStageHistory.create({
        data: { opportunityId: opportunity.id, toStage: OpportunityStage.NEW, actorId: input.createdBy },
      });
      return opportunity;
    });
  },

  transitionStage(id: string, fromStage: OpportunityStage, toStage: OpportunityStage, actorId: string, remark?: string) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.opportunity.update({
        where: { id },
        data: { stage: toStage, probability: STAGE_PROBABILITY[toStage] },
      });
      await tx.opportunityStageHistory.create({
        data: { opportunityId: id, fromStage, toStage, actorId, remark },
      });
      return updated;
    });
  },

  reassignOwner(id: string, ownerId: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.opportunity.update({ where: { id }, data: { ownerId } });
      await tx.activityLog.create({
        data: { entityType: 'Opportunity', entityId: id, action: 'REASSIGN', actorId, remark: `New owner: ${ownerId}` },
      });
      return updated;
    });
  },

  markLost(id: string, fromStage: OpportunityStage, reason: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.opportunity.update({
        where: { id },
        data: { stage: OpportunityStage.LOST, lostReason: reason, probability: STAGE_PROBABILITY.LOST },
      });
      await tx.opportunityStageHistory.create({
        data: { opportunityId: id, fromStage, toStage: OpportunityStage.LOST, actorId, remark: reason },
      });
      return updated;
    });
  },

  /**
   * SM-4.1 / SM-5.4 — Won hand-off. Transactionally: mark opportunity WON, and
   * create an AmcContract (deal_type=AMC) or a placeholder Project (deal_type
   * in INSTALLATION/PRODUCT) so the downstream module has a record to take over.
   */
  win(params: {
    opportunityId: string;
    fromStage: OpportunityStage;
    dealType: DealType;
    regionId: string;
    createdBy: string;
    input: WinInput;
    quotationTotal: number;
  }) {
    return prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.update({
        where: { id: params.opportunityId },
        data: { stage: OpportunityStage.WON, wonAt: new Date(), probability: STAGE_PROBABILITY.WON },
      });

      await tx.opportunityStageHistory.create({
        data: {
          opportunityId: params.opportunityId,
          fromStage: params.fromStage,
          toStage: OpportunityStage.WON,
          actorId: params.createdBy,
        },
      });

      if (params.dealType === DealType.AMC) {
        await tx.amcContract.create({
          data: {
            opportunityId: params.opportunityId,
            customerId: params.input.customerId,
            type: (params.input.amcType ?? AmcType.NON_COMPREHENSIVE) as AmcType,
            frequency: (params.input.amcFrequency ?? AmcFrequency.ANNUAL) as AmcFrequency,
            startDate: params.input.amcStartDate ?? new Date(),
            endDate:
              params.input.amcEndDate ?? new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
            value: params.quotationTotal,
            regionId: params.regionId,
            createdBy: params.createdBy,
          },
        });
      } else {
        await tx.project.create({
          data: {
            opportunityId: params.opportunityId,
            customerId: params.input.customerId,
            site: params.input.site,
            bom: params.input.bom,
            timeline: params.input.timeline,
            regionId: params.regionId,
            createdBy: params.createdBy,
          },
        });
      }

      return opportunity;
    });
  },
};
