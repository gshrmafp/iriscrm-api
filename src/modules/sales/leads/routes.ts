import { Router } from 'express';
import { asyncHandler } from '../../../core/http/asyncHandler';
import { requireAuth } from '../../../core/middleware/requireAuth';
import { requirePermission } from '../../../core/middleware/requirePermission';
import { validateBody, validateQuery } from '../../../core/middleware/validate';
import { PERMISSIONS } from '../../../config/permissions';
import { createEntityCommentSchema, updateEntityCommentSchema } from '../../comments/dto';
import { leadController } from './controller';
import {
  addFollowUpSchema,
  createLeadSchema,
  listLeadsQuerySchema,
  markLostSchema,
  qualifyLeadSchema,
} from './dto';

export const leadRouter = Router();

/**
 * @openapi
 * /leads:
 *   post:
 *     summary: Capture a lead (SM-1.1..SM-1.6)
 *     tags: [Leads]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contactName, source]
 *             properties:
 *               contactName: { type: string, example: "Acme Corp" }
 *               companyName: { type: string }
 *               contactPhone: { type: string, example: "9999999999", description: "10-digit Indian mobile number, optional +91/0 prefix" }
 *               contactEmail: { type: string, example: "buyer@acme.com" }
 *               gpsLatitude: { type: number, example: 28.4595 }
 *               gpsLongitude: { type: number, example: 77.0266 }
 *               source:
 *                 type: string
 *                 description: Code of an active Lead Source picklist option (GET /picklists?listType=LEAD_SOURCE) — admin-managed, not a fixed enum.
 *                 example: "WEB_FORM"
 *               productInterest:
 *                 type: string
 *                 description: Code of an active Product Interest picklist option (GET /picklists?listType=PRODUCT_INTEREST), optional.
 *                 example: "CCTV_INSTALLATION"
 *               notes: { type: string }
 *               regionId: { type: string, description: "Admin override only" }
 *               ownerId: { type: string, description: "Defaults to the creator" }
 *     responses:
 *       201: { description: Created }
 *   get:
 *     summary: List leads visible to the caller (own / team / region / all by role), paginated
 *     tags: [Leads]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [createdAt, updatedAt, contactName], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [NEW, QUALIFIED, LOST] }
 *       - in: query
 *         name: source
 *         schema: { type: string }
 *       - in: query
 *         name: productInterest
 *         schema: { type: string }
 *       - in: query
 *         name: ownerId
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         description: Matches contactName / companyName / contactPhone / contactEmail
 *         schema: { type: string }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: "Paginated result: { data: { items, total, page, pageSize, totalPages } }"
 */
leadRouter.post(
  '/leads',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_LEAD_CREATE),
  validateBody(createLeadSchema),
  asyncHandler(leadController.create),
);
leadRouter.get(
  '/leads',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_LEAD_VIEW),
  validateQuery(listLeadsQuerySchema),
  asyncHandler(leadController.list),
);

/**
 * @openapi
 * /leads/{id}:
 *   get:
 *     summary: Get one lead with follow-up history
 *     tags: [Leads]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
leadRouter.get(
  '/leads/:id',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_LEAD_VIEW),
  asyncHandler(leadController.get),
);

/**
 * @openapi
 * /leads/{id}/follow-ups:
 *   post:
 *     summary: Log a follow-up (call/meeting/email) with an optional next-action reminder (SM-1.9, SM-1.10)
 *     tags: [Leads]
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
 *             required: [note, channel]
 *             properties:
 *               note: { type: string, example: "Discussed pricing, sending quote" }
 *               channel: { type: string, enum: [call, meeting, email], example: "call" }
 *               nextActionAt: { type: string, format: date-time }
 *     responses:
 *       201: { description: Created }
 */
leadRouter.post(
  '/leads/:id/follow-ups',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_LEAD_CREATE),
  validateBody(addFollowUpSchema),
  asyncHandler(leadController.addFollowUp),
);

/**
 * @openapi
 * /leads/{id}/lost:
 *   post:
 *     summary: Mark a lead Lost with a mandatory reason (SM-1.11)
 *     tags: [Leads]
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
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [price, competitor, no_budget, no_response, other]
 *                 example: "price"
 *     responses:
 *       200: { description: OK }
 */
leadRouter.post(
  '/leads/:id/lost',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_LEAD_CREATE),
  validateBody(markLostSchema),
  asyncHandler(leadController.markLost),
);

/**
 * @openapi
 * /leads/{id}/qualify:
 *   post:
 *     summary: Convert a lead into an Opportunity (SM-1.7)
 *     tags: [Leads]
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
 *             required: [dealType, value]
 *             properties:
 *               dealType: { type: string, enum: [INSTALLATION, AMC, PRODUCT], example: "INSTALLATION" }
 *               value: { type: number, example: 40000 }
 *               expectedClose: { type: string, format: date-time }
 *     responses:
 *       201: { description: Created }
 */
leadRouter.post(
  '/leads/:id/qualify',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_LEAD_CREATE),
  validateBody(qualifyLeadSchema),
  asyncHandler(leadController.qualify),
);

/**
 * @openapi
 * /leads/{id}/comments:
 *   get:
 *     summary: List comments on a lead
 *     tags: [Leads]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Add a comment to a lead
 *     tags: [Leads]
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
 *             required: [body]
 *             properties:
 *               body: { type: string }
 *               isInternalNote: { type: boolean }
 *               mentionedUserIds: { type: array, items: { type: string } }
 *     responses:
 *       201: { description: Created }
 */
leadRouter.get(
  '/leads/:id/comments',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_LEAD_VIEW),
  asyncHandler(leadController.listComments),
);
leadRouter.post(
  '/leads/:id/comments',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_LEAD_COMMENT),
  validateBody(createEntityCommentSchema),
  asyncHandler(leadController.addComment),
);

/**
 * @openapi
 * /leads/{id}/comments/{commentId}:
 *   patch:
 *     summary: Edit a lead comment (Super Admin only — comments are a permanent audit trail)
 *     tags: [Leads]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body: { type: string }
 *     responses:
 *       200: { description: OK }
 *   delete:
 *     summary: Soft-delete a lead comment (Super Admin only)
 *     tags: [Leads]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
leadRouter.patch(
  '/leads/:id/comments/:commentId',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_LEAD_COMMENT),
  validateBody(updateEntityCommentSchema),
  asyncHandler(leadController.updateComment),
);
leadRouter.delete(
  '/leads/:id/comments/:commentId',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_LEAD_COMMENT),
  asyncHandler(leadController.deleteComment),
);
