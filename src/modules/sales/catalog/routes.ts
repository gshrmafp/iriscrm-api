import { Router } from 'express';
import { asyncHandler } from '../../../core/http/asyncHandler';
import { requireAuth } from '../../../core/middleware/requireAuth';
import { requirePermission } from '../../../core/middleware/requirePermission';
import { validateBody, validateQuery } from '../../../core/middleware/validate';
import { PERMISSIONS } from '../../../config/permissions';
import { catalogController } from './controller';
import {
  createCatalogItemSchema,
  createPriceRuleSchema,
  listCatalogItemsQuerySchema,
  updateCatalogItemSchema,
} from './dto';

export const catalogRouter = Router();

/**
 * @openapi
 * /catalog/items:
 *   get:
 *     summary: List catalog items, paginated
 *     tags: [Catalog]
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
 *         schema: { type: string, enum: [name, basePrice, createdAt, category], default: name }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: asc }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: taxClass
 *         schema: { type: string }
 *       - in: query
 *         name: active
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         description: Matches code / name
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "Paginated result: { data: { items, total, page, pageSize, totalPages } }"
 *   post:
 *     summary: Create a catalog item (Super Admin only)
 *     tags: [Catalog]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name, category, unit, basePrice, taxClass]
 *             properties:
 *               code: { type: string, example: "CAM-001" }
 *               name: { type: string, example: "IP Camera 4MP" }
 *               category: { type: string, example: "CCTV" }
 *               unit: { type: string, example: "pcs" }
 *               basePrice: { type: number, example: 5000 }
 *               taxClass: { type: string, example: "GST18" }
 *     responses:
 *       201: { description: Created }
 */
catalogRouter.get(
  '/catalog/items',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_CATALOG_VIEW),
  validateQuery(listCatalogItemsQuerySchema),
  asyncHandler(catalogController.list),
);
catalogRouter.post(
  '/catalog/items',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_CATALOG_MANAGE),
  validateBody(createCatalogItemSchema),
  asyncHandler(catalogController.create),
);

/**
 * @openapi
 * /catalog/items/{id}:
 *   patch:
 *     summary: Update a catalog item (Super Admin only)
 *     tags: [Catalog]
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
 *             properties:
 *               name: { type: string }
 *               category: { type: string }
 *               unit: { type: string }
 *               basePrice: { type: number }
 *               taxClass: { type: string }
 *               active: { type: boolean }
 *     responses:
 *       200: { description: OK }
 */
catalogRouter.patch(
  '/catalog/items/:id',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_CATALOG_MANAGE),
  validateBody(updateCatalogItemSchema),
  asyncHandler(catalogController.update),
);

/**
 * @openapi
 * /catalog/items/{id}/price:
 *   get:
 *     summary: Resolve the effective price for an item in the caller's (or a given) region
 *     tags: [Catalog]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: regionId
 *         required: false
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
catalogRouter.get(
  '/catalog/items/:id/price',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_CATALOG_VIEW),
  asyncHandler(catalogController.resolvePrice),
);

/**
 * @openapi
 * /catalog/price-rules:
 *   post:
 *     summary: Create a price rule for a catalog item (Super Admin manages, Regional Admin approves)
 *     tags: [Catalog]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [catalogItemId, ruleType, value, effectiveFrom]
 *             properties:
 *               catalogItemId: { type: string }
 *               regionId: { type: string }
 *               ruleType:
 *                 type: string
 *                 enum: [REGION_OVERRIDE, VOLUME_SLAB, CUSTOMER_TIER, PROMOTIONAL]
 *                 example: "PROMOTIONAL"
 *               value: { type: number, example: 10, description: "Absolute price for REGION_OVERRIDE, % for PROMOTIONAL" }
 *               effectiveFrom: { type: string, format: date-time }
 *               effectiveTo: { type: string, format: date-time }
 *     responses:
 *       201: { description: Created }
 */
catalogRouter.post(
  '/catalog/price-rules',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_CATALOG_APPROVE),
  validateBody(createPriceRuleSchema),
  asyncHandler(catalogController.createPriceRule),
);
