import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/middleware/requireAuth';
import { requirePermission } from '../../core/middleware/requirePermission';
import { validateBody, validateQuery } from '../../core/middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { picklistController } from './controller';
import { createPicklistOptionSchema, listPicklistQuerySchema, updatePicklistOptionSchema } from './dto';

export const picklistRouter = Router();

/**
 * @openapi
 * /picklists:
 *   get:
 *     summary: List active options for a picklist (e.g. Lead Source, Product Interest) — any authenticated user
 *     tags: [Picklists]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: listType
 *         required: true
 *         schema: { type: string, enum: [LEAD_SOURCE, PRODUCT_INTEREST] }
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Create a picklist option (Admin+)
 *     tags: [Picklists]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [listType, code, label]
 *             properties:
 *               listType: { type: string, enum: [LEAD_SOURCE, PRODUCT_INTEREST] }
 *               code: { type: string, example: "WEB_FORM" }
 *               label: { type: string, example: "Web form" }
 *               sortOrder: { type: integer }
 *     responses:
 *       201: { description: Created }
 */
picklistRouter.get(
  '/picklists',
  requireAuth,
  validateQuery(listPicklistQuerySchema),
  asyncHandler(picklistController.listActive),
);
picklistRouter.post(
  '/picklists',
  requireAuth,
  requirePermission(PERMISSIONS.PICKLIST_MANAGE),
  validateBody(createPicklistOptionSchema),
  asyncHandler(picklistController.create),
);

/**
 * @openapi
 * /picklists/all:
 *   get:
 *     summary: List every option (incl. inactive) for a picklist — Admin management screen
 *     tags: [Picklists]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: listType
 *         required: true
 *         schema: { type: string, enum: [LEAD_SOURCE, PRODUCT_INTEREST] }
 *     responses:
 *       200: { description: OK }
 */
picklistRouter.get(
  '/picklists/all',
  requireAuth,
  requirePermission(PERMISSIONS.PICKLIST_MANAGE),
  validateQuery(listPicklistQuerySchema),
  asyncHandler(picklistController.listAll),
);

/**
 * @openapi
 * /picklists/{id}:
 *   patch:
 *     summary: Rename, reorder, or activate/deactivate a picklist option (Admin+)
 *     tags: [Picklists]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
picklistRouter.patch(
  '/picklists/:id',
  requireAuth,
  requirePermission(PERMISSIONS.PICKLIST_MANAGE),
  validateBody(updatePicklistOptionSchema),
  asyncHandler(picklistController.update),
);
