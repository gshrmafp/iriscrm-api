import { Router } from 'express';
import { asyncHandler } from '../../../core/http/asyncHandler';
import { requireAuth } from '../../../core/middleware/requireAuth';
import { requirePermission } from '../../../core/middleware/requirePermission';
import { validateBody } from '../../../core/middleware/validate';
import { PERMISSIONS } from '../../../config/permissions';
import { quotationController } from './controller';
import { createQuotationSchema, reviseQuotationSchema } from './dto';

export const quotationRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     QuotationLineInput:
 *       type: object
 *       required: [description, qty, unitPrice]
 *       properties:
 *         catalogItemId: { type: string }
 *         description: { type: string, example: "IP Camera 4MP x8" }
 *         qty: { type: number, example: 8 }
 *         unitPrice: { type: number, example: 5000 }
 *         discount: { type: number, example: 1000, description: "Absolute amount, not %" }
 *         taxRatePct: { type: number, example: 18 }
 *
 * /quotations:
 *   post:
 *     summary: Create a draft quotation for an opportunity
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [opportunityId, lines]
 *             properties:
 *               opportunityId: { type: string }
 *               validTill: { type: string, format: date-time }
 *               lines:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/QuotationLineInput' }
 *     responses:
 *       201: { description: Created }
 */
quotationRouter.post(
  '/quotations',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUOTATION_CREATE),
  validateBody(createQuotationSchema),
  asyncHandler(quotationController.create),
);

/**
 * @openapi
 * /quotations/{id}/revise:
 *   post:
 *     summary: Create a new version of a quotation (prior versions stay immutable)
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lines]
 *             properties:
 *               validTill: { type: string, format: date-time }
 *               lines:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/QuotationLineInput' }
 *     responses:
 *       201: { description: Created }
 */
quotationRouter.post(
  '/quotations/:id/revise',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUOTATION_CREATE),
  validateBody(reviseQuotationSchema),
  asyncHandler(quotationController.revise),
);

/**
 * @openapi
 * /quotations/{id}/submit:
 *   post:
 *     summary: Submit a draft for issue — self-approves if within the caller's limit, else PENDING_APPROVAL
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
quotationRouter.post(
  '/quotations/:id/submit',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUOTATION_CREATE),
  asyncHandler(quotationController.submit),
);

/**
 * @openapi
 * /quotations/{id}/approve:
 *   post:
 *     summary: Approve a pending quotation (role-gated by approval limit / override authority)
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
quotationRouter.post(
  '/quotations/:id/approve',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUOTATION_APPROVE),
  asyncHandler(quotationController.approve),
);

/**
 * @openapi
 * /quotations/{id}/reject:
 *   post:
 *     summary: Reject a pending quotation
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
quotationRouter.post(
  '/quotations/:id/reject',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUOTATION_APPROVE),
  asyncHandler(quotationController.reject),
);

/**
 * @openapi
 * /quotations/{id}/send:
 *   post:
 *     summary: Mark an approved quotation as sent to the customer
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
quotationRouter.post(
  '/quotations/:id/send',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUOTATION_CREATE),
  asyncHandler(quotationController.send),
);

/**
 * @openapi
 * /opportunities/{opportunityId}/quotations:
 *   get:
 *     summary: List all quotation versions for an opportunity
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: opportunityId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
quotationRouter.get(
  '/opportunities/:opportunityId/quotations',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_QUOTATION_VIEW),
  asyncHandler(quotationController.listForOpportunity),
);
