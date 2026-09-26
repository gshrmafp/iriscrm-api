import { LeadStatus, OpportunityStage } from '@prisma/client';
import { AuthUser } from '../../../core/middleware/types';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../core/errors/AppError';
import { CROSS_REGION_ROLES } from '../../../config/permissions';
import { assertSameRegionOrElevated } from '../../../core/rbac/regionScope';
import { generateId } from '../../../core/utils/idGenerator';
import { identityRepository } from '../../identity/repository';
import { opportunityService } from '../opportunities/service';
import { opportunityRepository } from '../opportunities/repository';
import { registerCommentEntityAccessCheck } from '../../comments/service';
import { leadRepository } from './repository';
import {
  AddFollowUpInput,
  AddMeetingInput,
  JourneySummaryQuery,
  ListLeadFollowUpsQuery,
  ListLeadsQuery,
  SaveStep1Input,
  SaveStep2Input,
  SaveStep3Input,
  TeamPerformanceQuery,
} from './dto';

// Never-regress stage ranking for the auto-advance side effect: logging a
// follow-up/meeting only ever moves an opportunity FORWARD (e.g. logging a
// follow-up after a meeting already happened must not move it back).
const STAGE_RANK: Record<OpportunityStage, number> = {
  [OpportunityStage.QUOTATION]: 0,
  [OpportunityStage.FOLLOWUP]: 1,
  [OpportunityStage.MEETING]: 2,
  [OpportunityStage.PURCHASE_ORDER]: 3,
  [OpportunityStage.LOST]: -1, // terminal — never auto-advanced past
};

// Snapshot of which of the 7 named stages was active at the moment a
// follow-up/meeting is logged — captured BEFORE this same action's own
// auto-advance runs, so e.g. the meeting that pushes an opportunity from
// FOLLOWUP to MEETING itself files under "FOLLOWUP" (that's the stage it was
// logged during), not the stage it just caused. Powers the accordion-grouped
// Lead Journey view on the frontend.
function computeLoggedAtStage(lead: { status: LeadStatus; currentStep: number; opportunity?: { stage: OpportunityStage } | null }): string {
  if (lead.opportunity) return lead.opportunity.stage;
  if (lead.status === LeadStatus.LOST) return 'LOST';
  return lead.currentStep >= 2 ? 'CONTACTED' : 'NEW_LEAD';
}

async function advanceOpportunityStage(
  opportunity: { id: string; stage: OpportunityStage } | null | undefined,
  target: OpportunityStage,
  actorId: string,
) {
  if (!opportunity) return;
  if (opportunity.stage === OpportunityStage.LOST || opportunity.stage === OpportunityStage.PURCHASE_ORDER) return;
  if (STAGE_RANK[target] <= STAGE_RANK[opportunity.stage]) return;
  await opportunityRepository.transitionStage(opportunity.id, opportunity.stage, target, actorId);
}

function canViewAllLeadsInRegion(role: string) {
  return role === 'SUPER_ADMIN' || role === 'REGIONAL_ADMIN' || role === 'SALES_MANAGER';
}

function buildLeadScopeWhere(actor: AuthUser) {
  return CROSS_REGION_ROLES.includes(actor.role)
    ? {}
    : canViewAllLeadsInRegion(actor.role)
      ? { regionId: actor.regionId }
      : { regionId: actor.regionId, ownerId: actor.id };
}

async function loadOwnedOrThrow(id: string, actor: AuthUser) {
  const lead = await leadRepository.findById(id);
  if (!lead) throw new NotFoundError('Lead not found');
  assertSameRegionOrElevated(actor, lead.regionId);
  if (!canViewAllLeadsInRegion(actor.role) && lead.ownerId !== actor.id) {
    throw new ForbiddenError('You can only act on your own leads');
  }
  return lead;
}

export const leadService = {
  async list(actor: AuthUser, filters: ListLeadsQuery) {
    return leadRepository.list(buildLeadScopeWhere(actor), filters);
  },

  // Per-status lead counts, optionally narrowed to one owner — powers the
  // "how many leads has this rep worked, and what's their status" admin view.
  async statusSummary(actor: AuthUser, ownerId?: string) {
    return leadRepository.statusSummary(buildLeadScopeWhere(actor), ownerId);
  },

  // Combined Lead+Opportunity 7-stage breakdown (with recent leads per
  // stage) powering the Dashboard's sidebar.
  async journeySummary(actor: AuthUser, filters: JourneySummaryQuery) {
    return leadRepository.journeySummary(buildLeadScopeWhere(actor), filters);
  },

  async teamPerformance(actor: AuthUser, filters: TeamPerformanceQuery) {
    return leadRepository.teamPerformance(buildLeadScopeWhere(actor), filters);
  },

  async get(id: string, actor: AuthUser) {
    return loadOwnedOrThrow(id, actor);
  },

  async listFollowUps(actor: AuthUser, filters: ListLeadFollowUpsQuery) {
    return leadRepository.listFollowUps(buildLeadScopeWhere(actor), filters);
  },

  // Real, derived "needs attention" signal (no follow-up in 3+ days) — not a
  // stored/subjective field. Powers the mobile Home dashboard's lead tile.
  async dashboardSummary(actor: AuthUser, ownerId?: string) {
    return leadRepository.dashboardSummary(buildLeadScopeWhere(actor), ownerId);
  },

  // Loggable at any point in the lead's life — before and after qualification.
  // Once an Opportunity exists, logging a follow-up advances its stage to
  // FOLLOWUP (never-regress: only if it's currently at QUOTATION).
  async addFollowUp(id: string, actor: AuthUser, input: AddFollowUpInput) {
    const lead = await loadOwnedOrThrow(id, actor);
    const loggedAtStage = computeLoggedAtStage(lead);
    const followUp = await leadRepository.addFollowUp(id, { ...input, loggedAtStage, createdBy: actor.id });
    await advanceOpportunityStage(lead.opportunity, OpportunityStage.FOLLOWUP, actor.id);
    return followUp;
  },

  async completeFollowUp(followUpId: string, actor: AuthUser) {
    const followUp = await leadRepository.findFollowUpById(followUpId);
    if (!followUp) throw new NotFoundError('Follow-up not found');
    assertSameRegionOrElevated(actor, followUp.lead.regionId);
    if (!canViewAllLeadsInRegion(actor.role) && followUp.lead.ownerId !== actor.id) {
      throw new ForbiddenError('You can only act on your own leads');
    }
    if (followUp.completedAt) throw new BadRequestError('Follow-up is already complete');
    return leadRepository.completeFollowUp(followUpId);
  },

  // Physical meeting log — note + silently-captured GPS. Loggable at any
  // point in the lead's life, same as addFollowUp. Advances the opportunity's
  // stage to MEETING (never-regress: only if currently at QUOTATION or FOLLOWUP).
  async addMeeting(id: string, actor: AuthUser, input: AddMeetingInput) {
    const lead = await loadOwnedOrThrow(id, actor);
    const loggedAtStage = computeLoggedAtStage(lead);
    const meeting = await leadRepository.addMeeting(id, { ...input, loggedAtStage, createdBy: actor.id });
    await advanceOpportunityStage(lead.opportunity, OpportunityStage.MEETING, actor.id);
    return meeting;
  },

  // ---------- Stepped lead creation (3-step wizard) ----------

  async createStepped(actor: AuthUser, input: SaveStep1Input) {
    const regionId = actor.regionId;
    const region = await identityRepository.findRegionById(regionId);
    if (!region) throw new BadRequestError('Region not found');

    const refNo = await leadRepository.nextSteppedRefNo(region.code);
    const id = await generateId('LEAD');
    const lead = await leadRepository.createStepped({
      ...input,
      id,
      refNo,
      regionId,
      ownerId: actor.id,
      createdBy: actor.id,
    });
    return { lead };
  },

  async saveStep2(id: string, actor: AuthUser, input: SaveStep2Input) {
    const lead = await loadOwnedOrThrow(id, actor);
    if (lead.currentStep !== 1) {
      throw new BadRequestError('Step 2 can only be saved after Step 1 is complete');
    }

    const duplicates = await leadRepository.findDuplicates(
      lead.regionId,
      input.contactPhone || undefined,
      input.contactEmail || undefined,
    );

    const updated = await leadRepository.updateStep2(id, {
      contactName: input.contactName,
      contactPhone: input.contactPhone || undefined,
      contactEmail: input.contactEmail || undefined,
      discussionNote: input.discussionNote,
    });

    return { lead: updated, duplicateWarning: duplicates.length > 0 ? duplicates.map((d) => d.refNo) : undefined };
  },

  async saveStep3(id: string, actor: AuthUser, input: SaveStep3Input) {
    const lead = await loadOwnedOrThrow(id, actor);
    if (lead.currentStep !== 2) {
      throw new BadRequestError('Step 3 can only be saved after Step 2 is complete');
    }

    if (input.path === 'NOT_QUALIFIED') {
      const updated = await leadRepository.updateStep3(id, {
        status: LeadStatus.LOST,
        lostReason: input.remark,
        qualificationPath: 'NOT_QUALIFIED',
      });
      return { lead: updated };
    }

    if (input.path === 'FUTURE_POTENTIAL') {
      const updated = await leadRepository.updateStep3(id, {
        status: LeadStatus.NEW,
        qualificationPath: 'FUTURE_POTENTIAL',
      });
      const followUp = await leadRepository.addFollowUp(id, {
        note: input.remarks || 'Scheduled follow-up',
        channel: 'meeting',
        nextActionAt: input.followUpDate,
        loggedAtStage: 'CONTACTED',
        createdBy: actor.id,
      });
      return { lead: updated, followUp };
    }

    // REQUIREMENT_IDENTIFIED
    const updated = await leadRepository.updateStep3(id, {
      status: LeadStatus.QUALIFIED,
      qualificationPath: 'REQUIREMENT_IDENTIFIED',
    });
    const opportunity = await opportunityService.createFromLead(
      { ...lead, contactName: lead.contactName ?? lead.companyName ?? '' },
      { dealType: input.dealType, value: input.quotationAmount },
      actor,
      {
        initialQuotationRef: input.quotationRef,
        initialQuotationDate: input.quotationDate,
        initialQuotationAmount: input.quotationAmount,
      },
    );
    return { lead: updated, opportunity };
  },
};

registerCommentEntityAccessCheck('LEAD', (id, actor) => leadService.get(id, actor));
