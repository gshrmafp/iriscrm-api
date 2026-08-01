import { QuotationStatus, Role } from "@prisma/client";
import { AuthUser } from "../../../core/middleware/types";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../../core/errors/AppError";
import { APPROVAL_LIMITS, PERMISSIONS } from "../../../config/permissions";
import { getEffectivePermissions } from "../../../core/rbac/effectivePermissions";
import { eventBus, DOMAIN_EVENTS } from "../../../core/events/eventBus";
import { opportunityRepository } from "../opportunities/repository";
import { opportunityService } from "../opportunities/service";
import { quotationRepository } from "./repository";
import { computeTotals } from "./pricing";
import { CreateQuotationInput, ReviseQuotationInput } from "./dto";

async function loadOpenOpportunityOrThrow(opportunityId: string) {
  const opportunity = await opportunityRepository.findById(opportunityId);
  if (!opportunity) throw new NotFoundError("Opportunity not found");
  if (opportunity.stage === "WON" || opportunity.stage === "LOST") {
    throw new BadRequestError("Cannot quote a closed opportunity");
  }
  return opportunity;
}

function withinOwnLimit(
  role: Role,
  grandTotal: number,
  discountPct: number,
): boolean {
  const limit = APPROVAL_LIMITS[role];
  if (limit === null) return true; // unlimited (Super Admin)
  if (!limit) return false;
  return grandTotal <= limit.maxValue && discountPct <= limit.maxDiscountPct;
}

export const quotationService = {
  async create(actor: AuthUser, input: CreateQuotationInput) {
    const opportunity = await loadOpenOpportunityOrThrow(input.opportunityId);
    const totals = computeTotals(input.lines);

    return quotationRepository.create({
      opportunityId: opportunity.id,
      version: 1,
      regionId: opportunity.regionId,
      createdBy: actor.id,
      validTill: input.validTill,
      totals,
    });
  },

  async revise(
    actor: AuthUser,
    quotationId: string,
    input: ReviseQuotationInput,
  ) {
    const existing = await quotationRepository.findById(quotationId);
    if (!existing) throw new NotFoundError("Quotation not found");
    await loadOpenOpportunityOrThrow(existing.opportunityId);

    const totals = computeTotals(input.lines);
    const nextVersion =
      (await quotationRepository.latestVersion(existing.opportunityId)) + 1;

    return quotationRepository.create({
      opportunityId: existing.opportunityId,
      version: nextVersion,
      regionId: existing.regionId,
      createdBy: actor.id,
      validTill: input.validTill,
      totals,
    });
  },

  /**
   * SM-3.5 — submit for issue. If the quote is within the creator's own
   * approval limit (value + discount %), it self-approves immediately;
   * otherwise it moves to PENDING_APPROVAL for a Manager/Admin.
   */
  async submit(actor: AuthUser, quotationId: string) {
    const quotation = await quotationRepository.findById(quotationId);
    if (!quotation) throw new NotFoundError("Quotation not found");
    if (quotation.status !== QuotationStatus.DRAFT)
      throw new BadRequestError("Only a draft quotation can be submitted");

    const discountPct =
      Number(quotation.subtotal) > 0
        ? (Number(quotation.discountTotal) / Number(quotation.subtotal)) * 100
        : 0;

    if (withinOwnLimit(actor.role, Number(quotation.grandTotal), discountPct)) {
      return quotationRepository.updateStatus(
        quotationId,
        QuotationStatus.APPROVED,
        actor.id,
      );
    }
    return quotationRepository.updateStatus(
      quotationId,
      QuotationStatus.PENDING_APPROVAL,
    );
  },

  /**
   * SM-3.5 — approve a pending quotation. The approver must either be within
   * their own limit for this quote's value/discount, or hold the explicit
   * high-value/discount override permission (Regional Admin / Super Admin, SM-3.5).
   */
  async approve(actor: AuthUser, quotationId: string) {
    const quotation = await quotationRepository.findById(quotationId);
    if (!quotation) throw new NotFoundError("Quotation not found");
    if (quotation.status !== QuotationStatus.PENDING_APPROVAL) {
      throw new BadRequestError("Quotation is not pending approval");
    }

    const discountPct =
      Number(quotation.subtotal) > 0
        ? (Number(quotation.discountTotal) / Number(quotation.subtotal)) * 100
        : 0;

    const withinLimit = withinOwnLimit(
      actor.role,
      Number(quotation.grandTotal),
      discountPct,
    );
    if (!withinLimit) {
      const effective = await getEffectivePermissions(actor.id, actor.role);
      if (!effective.has(PERMISSIONS.SALES_QUOTATION_APPROVE_OVERRIDE)) {
        throw new ForbiddenError(
          "Quote exceeds your approval limit and you lack override authority",
        );
      }
    }

    return quotationRepository.updateStatus(
      quotationId,
      QuotationStatus.APPROVED,
      actor.id,
    );
  },

  async reject(quotationId: string) {
    const quotation = await quotationRepository.findById(quotationId);
    if (!quotation) throw new NotFoundError("Quotation not found");
    return quotationRepository.updateStatus(
      quotationId,
      QuotationStatus.REJECTED,
    );
  },

  // SM-3.7 — issue: mark SENT and emit QuotationIssued (PDF/email delivery is a
  // future async job; deferred per the infra decision to skip Redis/BullMQ for now).
  async send(quotationId: string) {
    const quotation = await quotationRepository.findById(quotationId);
    if (!quotation) throw new NotFoundError("Quotation not found");
    if (quotation.status !== QuotationStatus.APPROVED)
      throw new BadRequestError("Only an approved quotation can be sent");

    const updated = await quotationRepository.updateStatus(
      quotationId,
      QuotationStatus.SENT,
    );
    eventBus.publish(DOMAIN_EVENTS.QUOTATION_ISSUED, {
      quotationId,
      opportunityId: quotation.opportunityId,
    });
    return updated;
  },

  async listForOpportunity(
    opportunityId: string,
    actor: { id: string; role: Role; regionId: string },
  ) {
    const opp = await opportunityService.get(opportunityId, actor);
    if (!opp) throw new NotFoundError("Opportunity not found");
    return quotationRepository.listForOpportunity(opportunityId);
  },

  getLatestAcceptedTotal(opportunityId: string) {
    return quotationRepository.findLatestForOpportunity(opportunityId, [
      QuotationStatus.ACCEPTED,
      QuotationStatus.APPROVED,
      QuotationStatus.SENT,
    ]);
  },
};
