import { QuotationStatus } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import { QuotationTotals } from './pricing';

export const quotationRepository = {
  findById(id: string) {
    return prisma.quotation.findUnique({ where: { id }, include: { lines: true, opportunity: true } });
  },

  listForOpportunity(opportunityId: string) {
    return prisma.quotation.findMany({
      where: { opportunityId },
      include: { lines: true },
      orderBy: { version: 'desc' },
    });
  },

  async latestVersion(opportunityId: string) {
    const latest = await prisma.quotation.findFirst({
      where: { opportunityId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return latest?.version ?? 0;
  },

  findLatestForOpportunity(opportunityId: string, statuses?: QuotationStatus[]) {
    return prisma.quotation.findFirst({
      where: { opportunityId, ...(statuses ? { status: { in: statuses } } : {}) },
      orderBy: { version: 'desc' },
    });
  },

  create(params: {
    opportunityId: string;
    version: number;
    regionId: string;
    createdBy: string;
    validTill?: Date;
    totals: QuotationTotals;
  }) {
    return prisma.quotation.create({
      data: {
        opportunityId: params.opportunityId,
        version: params.version,
        regionId: params.regionId,
        createdBy: params.createdBy,
        validTill: params.validTill,
        subtotal: params.totals.subtotal,
        discountTotal: params.totals.discountTotal,
        taxTotal: params.totals.taxTotal,
        grandTotal: params.totals.grandTotal,
        status: QuotationStatus.DRAFT,
        lines: {
          create: params.totals.lines.map((line) => ({
            catalogItemId: line.catalogItemId,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
            discount: line.discount,
            tax: line.lineTotal - (line.qty * line.unitPrice - line.discount),
            lineTotal: line.lineTotal,
          })),
        },
      },
      include: { lines: true },
    });
  },

  updateStatus(id: string, status: QuotationStatus, approvedById?: string) {
    return prisma.quotation.update({
      where: { id },
      data: { status, approvedById, approvedAt: approvedById ? new Date() : undefined },
    });
  },
};
