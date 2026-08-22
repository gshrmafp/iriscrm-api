import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/middleware/requireAuth';
import { requirePermission } from '../../core/middleware/requirePermission';
import { validateBody, validateQuery } from '../../core/middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { customerController } from './controller';
import { createCustomerSchema, listCustomersQuerySchema } from './dto';

export const customerRouter = Router();

/**
 * @openapi
 * /customers:
 *   post:
 *     summary: Create a customer
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type]
 *             properties:
 *               name: { type: string }
 *               type: { type: string, example: "Business" }
 *               contacts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties: { name: { type: string }, phone: { type: string }, email: { type: string } }
 *               addresses:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties: { line1: { type: string }, city: { type: string }, state: { type: string }, pincode: { type: string } }
 *               regionId: { type: string, description: "Admin override only" }
 *     responses:
 *       201: { description: Created }
 *   get:
 *     summary: List customers visible to the caller (region-scoped unless cross-region), paginated
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: active
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: "Paginated result: { data: { items, total, page, pageSize, totalPages } }"
 */
customerRouter.post(
  '/customers',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_CUSTOMER_CREATE),
  validateBody(createCustomerSchema),
  asyncHandler(customerController.create),
);
customerRouter.get(
  '/customers',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_CUSTOMER_VIEW),
  validateQuery(listCustomersQuerySchema),
  asyncHandler(customerController.list),
);

/**
 * @openapi
 * /customers/{id}:
 *   get:
 *     summary: Get one customer
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
customerRouter.get(
  '/customers/:id',
  requireAuth,
  requirePermission(PERMISSIONS.SALES_CUSTOMER_VIEW),
  asyncHandler(customerController.get),
);
