import { DealType, Lead, OpportunityStage, Role } from '@prisma/client';
import { AuthUser } from '../../../core/middleware/types';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../core/errors/AppError';
import { CROSS_REGION_ROLES } from '../../../config/permissions';
import { eventBus, DOMAIN_EVENTS } from '../../../core/events/eventBus';
import { assertSameRegionOrElevated } from '../../../core/rbac/regionScope';
import { quotationService } from '../quotations/service';
import { registerCommentEntityAccessCheck } from '../../comments/service';
import { opportunityRepository } from './repository';
import { isValidTransition } from './pipeline';
import { QualifyLeadInput } from '../leads/dto';
import { ListOpportunitiesQuery, ReassignInput, TransitionStageInput, WinInput } from './dto';

function canManageAllOpportunities(role: Role) {
  return role === Role.SUPER_ADMIN || role === Role.REGIONAL_ADMIN || role === Role.SALES_MANAGER;
}

async function loadOwnedOrThrow(id: string, actor: AuthUser) {
  const opportunity = await opportunityRepository.findById(id);
  if (!opportunity) throw new NotFoundError('Opportunity not found');
  assertSameRegionOrElevated(actor, opportunity.regionId);
  if (!canManageAllOpportunities(actor.role) && opportunity.ownerId !== actor.id) {
    throw new ForbiddenError('You can only act on your own opportunities');
  }
  return opportunity;
}

export const opportunityService = {
  // Called from leads/service.qualify — lead is already loaded/ownership-checked there.
  createFromLead(lead: Lead, input: QualifyLeadInput, actor: AuthUser) {
    return opportunityRepository.createFromLead({
      leadId: lead.id,
      dealType: input.dealType as DealType,
      value: input.value,
      expectedClose: input.expectedClose,
      regionId: lead.regionId,
      ownerId: lead.ownerId,
      createdBy: actor.id,
    });
  },

  buildScopeWhere(actor: AuthUser) {
    return CROSS_REGION_ROLES.includes(actor.role)
      ? {}
      : canManageAllOpportunities(actor.role)
        ? { regionId: actor.regionId }
        : { regionId: actor.regionId, ownerId: actor.id };
  },

  async list(actor: AuthUser, filters: ListOpportunitiesQuery) {
    return opportunityRepository.list(this.buildScopeWhere(actor), filters);
  },

  async getPipelineSummary(actor: AuthUser, ownerId?: string) {
    return opportunityRepository.getPipelineSummary(this.buildScopeWhere(actor), ownerId);
  },

  async get(id: string, actor: AuthUser) {
    return loadOwnedOrThrow(id, actor);
  },

  async transitionStage(id: string, actor: AuthUser, input: TransitionStageInput) {
    const opportunity = await loadOwnedOrThrow(id, actor);
    if (!isValidTransition(opportunity.stage, input.toStage)) {
      throw new BadRequestError(`Cannot move from ${opportunity.stage} to ${input.toStage}`);
    }
    const updated = await opportunityRepository.transitionStage(id, opportunity.stage, input.toStage, actor.id, input.remark);
    if (input.toStage === OpportunityStage.LOST) {
      eventBus.publish(DOMAIN_EVENTS.OPPORTUNITY_LOST, { opportunityId: id, reason: input.remark });
    }
    return updated;
  },

  // SM-1.8 — reassign within region; Sales Exec has no reassign permission at all
  // (enforced by requirePermission on the route), Manager reassigns within their team.
  async reassign(id: string, actor: AuthUser, input: ReassignInput) {
    const opportunity = await opportunityRepository.findById(id);
    if (!opportunity) throw new NotFoundError('Opportunity not found');
    assertSameRegionOrElevated(actor, opportunity.regionId);
    return opportunityRepository.reassignOwner(id, input.ownerId, actor.id);
  },

  async markLost(id: string, actor: AuthUser, reason: string) {
    const opportunity = await loadOwnedOrThrow(id, actor);
    if (opportunity.stage === OpportunityStage.WON || opportunity.stage === OpportunityStage.LOST) {
      throw new BadRequestError('Opportunity is already closed');
    }
    const updated = await opportunityRepository.markLost(id, opportunity.stage, reason, actor.id);
    eventBus.publish(DOMAIN_EVENTS.OPPORTUNITY_LOST, { opportunityId: id, reason });
    return updated;
  },

  // SM-2.1 exit condition for Won: emits OpportunityWon, consumed later by the
  // real AMC/Project modules (Section 8 hand-off table).
  async win(id: string, actor: AuthUser, input: WinInput) {
    const opportunity = await loadOwnedOrThrow(id, actor);
    if (opportunity.stage !== OpportunityStage.NEGOTIATION && opportunity.stage !== OpportunityStage.QUOTED) {
      throw new BadRequestError('Opportunity must be in Quoted or Negotiation stage to win');
    }

    const latestQuote = await quotationService.getLatestAcceptedTotal(id);
    const quotationTotal = latestQuote ? Number(latestQuote.grandTotal) : Number(opportunity.value);

    const updated = await opportunityRepository.win({
      opportunityId: id,
      fromStage: opportunity.stage,
      dealType: opportunity.dealType,
      regionId: opportunity.regionId,
      createdBy: actor.id,
      input,
      quotationTotal,
    });

    eventBus.publish(DOMAIN_EVENTS.OPPORTUNITY_WON, {
      opportunityId: id,
      dealType: opportunity.dealType,
      regionId: opportunity.regionId,
    });

    return updated;
  },
};

registerCommentEntityAccessCheck('OPPORTUNITY', (id, actor) => opportunityService.get(id, actor));
