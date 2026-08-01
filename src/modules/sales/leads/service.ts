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
import { AddFollowUpInput, CreateLeadInput, ListLeadsQuery, MarkLostInput, QualifyLeadInput } from './dto';

function canViewAllLeadsInRegion(role: string) {
  return role === 'SUPER_ADMIN' || role === 'REGIONAL_ADMIN' || role === 'SALES_MANAGER';
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
    const where = CROSS_REGION_ROLES.includes(actor.role)
      ? {}
      : canViewAllLeadsInRegion(actor.role)
        ? { regionId: actor.regionId }
        : { regionId: actor.regionId, ownerId: actor.id };
    return leadRepository.list(where, filters);
  },

  async get(id: string, actor: AuthUser) {
    return loadOwnedOrThrow(id, actor);
  },

  // SM-1.9 / SM-1.10 — follow-up log with next-action reminder.
  async addFollowUp(id: string, actor: AuthUser, input: AddFollowUpInput) {
    await loadOwnedOrThrow(id, actor);
    return leadRepository.addFollowUp(id, { ...input, createdBy: actor.id });
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
};

registerCommentEntityAccessCheck('LEAD', (id, actor) => leadService.get(id, actor));
