import { LeadStatus, PicklistType } from '@prisma/client';
import { AuthUser } from '../../../core/middleware/types';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../core/errors/AppError';
import { CROSS_REGION_ROLES } from '../../../config/permissions';
import { assertSameRegionOrElevated } from '../../../core/rbac/regionScope';
import { generateId } from '../../../core/utils/idGenerator';
import { identityRepository } from '../../identity/repository';
import { picklistService } from '../../picklists/service';
import { opportunityService } from '../opportunities/service';
import { registerCommentEntityAccessCheck } from '../../comments/service';
import { leadRepository } from './repository';
import {
  AddFollowUpInput,
  CreateLeadInput,
  ListLeadFollowUpsQuery,
  ListLeadsQuery,
  MarkLostInput,
  QualifyLeadInput,
  SaveStep1Input,
  SaveStep2Input,
  SaveStep3Input,
} from './dto';

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
  // SM-1.1..1.6 — capture. Region auto-assigns from the creator unless an
  // Admin explicitly overrides it (SM-1.4); owner defaults to the creator.
  async create(actor: AuthUser, input: CreateLeadInput) {
    await picklistService.assertActiveOption(PicklistType.LEAD_SOURCE, input.source);
    if (input.productInterest) {
      await picklistService.assertActiveOption(PicklistType.PRODUCT_INTEREST, input.productInterest);
    }
    if (input.source === 'OTHER' && !input.sourceOther?.trim()) {
      throw new BadRequestError('Please specify the lead source');
    }
    if (input.productInterest === 'OTHER' && !input.productInterestOther?.trim()) {
      throw new BadRequestError('Please specify the product of interest');
    }

    let regionId = actor.regionId;
    if (input.regionId && input.regionId !== actor.regionId) {
      if (!CROSS_REGION_ROLES.includes(actor.role) && actor.role !== 'REGIONAL_ADMIN') {
        throw new ForbiddenError('Only an Admin can assign a lead to another region');
      }
      regionId = input.regionId;
    }

    const ownerId = input.ownerId ?? actor.id;

    const duplicates = await leadRepository.findDuplicates(regionId, input.contactPhone, input.contactEmail);

    const region = await identityRepository.findRegionById(regionId);
    if (!region) throw new BadRequestError('Region not found');

    const refNo = await leadRepository.nextRefNo(region.code, regionId);
    const id = await generateId('LEAD');
    const lead = await leadRepository.create({ ...input, id, refNo, regionId, ownerId, createdBy: actor.id });

    return { lead, duplicateWarning: duplicates.length > 0 ? duplicates.map((d) => d.refNo) : undefined };
  },

  async list(actor: AuthUser, filters: ListLeadsQuery) {
    return leadRepository.list(buildLeadScopeWhere(actor), filters);
  },

  // Per-status lead counts, optionally narrowed to one owner — powers the
  // "how many leads has this rep worked, and what's their status" admin view.
  async statusSummary(actor: AuthUser, ownerId?: string) {
    return leadRepository.statusSummary(buildLeadScopeWhere(actor), ownerId);
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

  // SM-1.9 / SM-1.10 — follow-up log with next-action reminder.
  async addFollowUp(id: string, actor: AuthUser, input: AddFollowUpInput) {
    await loadOwnedOrThrow(id, actor);
    return leadRepository.addFollowUp(id, { ...input, createdBy: actor.id });
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

  // SM-1.11 — mandatory reason to mark Lost.
  async markLost(id: string, actor: AuthUser, input: MarkLostInput) {
    const lead = await loadOwnedOrThrow(id, actor);
    if (lead.status === LeadStatus.LOST) throw new BadRequestError('Lead is already Lost');
    return leadRepository.markStatus(id, LeadStatus.LOST, input.reason);
  },

  // SM-1.7 — qualify a lead into an Opportunity.
  async qualify(id: string, actor: AuthUser, input: QualifyLeadInput) {
    const lead = await loadOwnedOrThrow(id, actor);
    if (lead.status !== LeadStatus.NEW) throw new BadRequestError('Only a new lead can be qualified');
    if (lead.opportunity) throw new BadRequestError('Lead already has an opportunity');

    const opportunity = await opportunityService.createFromLead(lead, input, actor);
    await leadRepository.markStatus(id, LeadStatus.QUALIFIED);
    return opportunity;
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
