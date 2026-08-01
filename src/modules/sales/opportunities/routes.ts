import { Router } from 'express';
import { asyncHandler } from '../../../core/http/asyncHandler';
import { requireAuth } from '../../../core/middleware/requireAuth';
import { requirePermission } from '../../../core/middleware/requirePermission';
import { validateBody, validateQuery } from '../../../core/middleware/validate';
import { PERMISSIONS } from '../../../config/permissions';
import { createEntityCommentSchema, updateEntityCommentSchema } from '../../comments/dto';
import { opportunityController } from './controller';
import {
  listOpportunitiesQuerySchema,
  markLostSchema,
  reassignSchema,
  transitionStageSchema,
  winSchema,
} from './dto';

export const opportunityRouter = Router();

/**
 * @openapi
 * /opportunities:
 *   get:
 *     summary: List opportunities visible to the caller (own / team / region / all by role), paginated
 *     tags: [Opportunities]
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
 *         schema: { type: string, enum: [createdAt, updatedAt, value, expectedClose], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - in: query
 *         name: stage
 *         schema: { type: string, enum: [NEW, CONTACTED, QUOTED, NEGOTIATION, WON, LOST] }
 *       - in: query
 *         name: dealType
 *         schema: { type: string, enum: [INSTALLATION, AMC, PRODUCT] }
 *       - in: query
 *         name: ownerId
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
opportunityRouter.get(
  '/opportunities',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_OPPORTUNITY_VIEW),
  validateQuery(listOpportunitiesQuerySchema),
  asyncHandler(opportunityController.list),
);

/**
 * @openapi
 * /opportunities/summary/stats:
 *   get:
 *     summary: Pipeline value / weighted forecast / open count across all open (non-Won/Lost) opportunities in scope
 *     tags: [Opportunities]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
opportunityRouter.get(
  '/opportunities/summary/stats',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_OPPORTUNITY_VIEW),
  asyncHandler(opportunityController.getPipelineSummary),
);

/**
 * @openapi
 * /opportunities/{id}:
 *   get:
 *     summary: Get one opportunity with stage history and quotations
 *     tags: [Opportunities]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
opportunityRouter.get(
  '/opportunities/:id',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_OPPORTUNITY_VIEW),
  asyncHandler(opportunityController.get),
);

/**
 * @openapi
 * /opportunities/{id}/stage:
 *   patch:
 *     summary: Move the opportunity to the next pipeline stage (audited, SM-2.2)
 *     tags: [Opportunities]
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
 *             required: [toStage]
 *             properties:
 *               toStage:
 *                 type: string
 *                 enum: [NEW, CONTACTED, QUOTED, NEGOTIATION, WON, LOST]
 *                 example: "CONTACTED"
 *               remark: { type: string }
 *     responses:
 *       200: { description: OK }
 */
opportunityRouter.patch(
  '/opportunities/:id/stage',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_OPPORTUNITY_VIEW),
  validateBody(transitionStageSchema),
  asyncHandler(opportunityController.transitionStage),
);

/**
 * @openapi
 * /opportunities/{id}/reassign:
 *   post:
 *     summary: Reassign the opportunity owner (Manager+ only)
 *     tags: [Opportunities]
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
 *             required: [ownerId]
 *             properties:
 *               ownerId: { type: string }
 *     responses:
 *       200: { description: OK }
 */
opportunityRouter.post(
  '/opportunities/:id/reassign',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_OPPORTUNITY_REASSIGN),
  validateBody(reassignSchema),
  asyncHandler(opportunityController.reassign),
);

/**
 * @openapi
 * /opportunities/{id}/lost:
 *   post:
 *     summary: Mark the opportunity Lost with a mandatory reason
 *     tags: [Opportunities]
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
 *               reason: { type: string, example: "Lost to competitor" }
 *     responses:
 *       200: { description: OK }
 */
opportunityRouter.post(
  '/opportunities/:id/lost',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_OPPORTUNITY_VIEW),
  validateBody(markLostSchema),
  asyncHandler(opportunityController.markLost),
);

/**
 * @openapi
 * /opportunities/{id}/win:
 *   post:
 *     summary: Close Won — creates the AmcContract or Project hand-off record (SM-4.1, SM-5.4)
 *     tags: [Opportunities]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               site: { type: string, example: "Acme HQ, Sector 21" }
 *               timeline: { type: string, example: "2 weeks" }
 *               customerId: { type: string }
 *               bom:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     catalogItemId: { type: string }
 *                     qty: { type: number }
 *               amcType: { type: string, enum: [COMPREHENSIVE, NON_COMPREHENSIVE] }
 *               amcFrequency: { type: string, enum: [MONTHLY, QUARTERLY, ANNUAL] }
 *               amcStartDate: { type: string, format: date-time }
 *               amcEndDate: { type: string, format: date-time }
 *     responses:
 *       200: { description: OK }
 */
opportunityRouter.post(
  '/opportunities/:id/win',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_OPPORTUNITY_WIN),
  validateBody(winSchema),
  asyncHandler(opportunityController.win),
);

/**
 * @openapi
 * /opportunities/{id}/comments:
 *   get:
 *     summary: List comments on an opportunity
 *     tags: [Opportunities]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Add a comment to an opportunity
 *     tags: [Opportunities]
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
opportunityRouter.get(
  '/opportunities/:id/comments',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_OPPORTUNITY_VIEW),
  asyncHandler(opportunityController.listComments),
);
opportunityRouter.post(
  '/opportunities/:id/comments',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_OPPORTUNITY_COMMENT),
  validateBody(createEntityCommentSchema),
  asyncHandler(opportunityController.addComment),
);

/**
 * @openapi
 * /opportunities/{id}/comments/{commentId}:
 *   patch:
 *     summary: Edit an opportunity comment (Super Admin only — comments are a permanent audit trail)
 *     tags: [Opportunities]
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
 *     summary: Soft-delete an opportunity comment (Super Admin only)
 *     tags: [Opportunities]
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
opportunityRouter.patch(
  '/opportunities/:id/comments/:commentId',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_OPPORTUNITY_COMMENT),
  validateBody(updateEntityCommentSchema),
  asyncHandler(opportunityController.updateComment),
);
opportunityRouter.delete(
  '/opportunities/:id/comments/:commentId',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_OPPORTUNITY_COMMENT),
  asyncHandler(opportunityController.deleteComment),
);
