import { Router } from 'express';
import { asyncHandler } from '../../core/http/asyncHandler';
import { requireAuth } from '../../core/middleware/requireAuth';
import { requirePermission } from '../../core/middleware/requirePermission';
import { validateBody, validateQuery } from '../../core/middleware/validate';
import { PERMISSIONS } from '../../config/permissions';
import { identityController } from './controller';
import {
  createRegionSchema,
  createUserSchema,
  listUsersQuerySchema,
  loginSchema,
  permissionOverrideSchema,
  refreshSchema,
  updateRegionSchema,
  updateUserStatusSchema,
} from './dto';

export const identityRouter = Router();

/**
 * @openapi
 * /regions:
 *   get:
 *     summary: List regions
 *     tags: [Identity]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   post:
 *     summary: Create a region (Super Admin only)
 *     tags: [Identity]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name]
 *             properties:
 *               code: { type: string, example: "GGN" }
 *               name: { type: string, example: "Gurugram" }
 *     responses:
 *       201: { description: Created }
 */
identityRouter.get('/regions', requireAuth, asyncHandler(identityController.listRegions));
identityRouter.post(
  '/regions',
  requireAuth,
  requirePermission(PERMISSIONS.IDENTITY_REGION_CONFIGURE),
  validateBody(createRegionSchema),
  asyncHandler(identityController.createRegion),
);

/**
 * @openapi
 * /regions/{id}:
 *   patch:
 *     summary: Activate or deactivate a region (Super Admin only)
 *     tags: [Identity]
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
 *             required: [active]
 *             properties:
 *               active: { type: boolean }
 *     responses:
 *       200: { description: OK }
 */
identityRouter.patch(
  '/regions/:id',
  requireAuth,
  requirePermission(PERMISSIONS.IDENTITY_REGION_CONFIGURE),
  validateBody(updateRegionSchema),
  asyncHandler(identityController.updateRegion),
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Login with email/password, returns JWT access + refresh tokens
 *     tags: [Identity]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: "superadmin@iris.local" }
 *               password: { type: string, example: "ChangeMe123!" }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Invalid credentials }
 */
identityRouter.post('/auth/login', validateBody(loginSchema), asyncHandler(identityController.login));

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Exchange a refresh token for a new access token
 *     tags: [Identity]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: OK }
 */
identityRouter.post('/auth/refresh', validateBody(refreshSchema), asyncHandler(identityController.refresh));

/**
 * @openapi
 * /users:
 *   post:
 *     summary: Create a user (Super Admin, or Regional Admin within own region)
 *     tags: [Identity]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role, regionId]
 *             properties:
 *               name: { type: string, example: "Rahul Exec" }
 *               email: { type: string, example: "rahul@iris.local" }
 *               password: { type: string, example: "Password123!" }
 *               role:
 *                 type: string
 *                 enum: [SUPER_ADMIN, REGIONAL_ADMIN, SALES_MANAGER, SALES_EXECUTIVE, AUDITOR]
 *                 example: "SALES_EXECUTIVE"
 *               regionId: { type: string }
 *               reportingToId: { type: string }
 *     responses:
 *       201: { description: Created }
 *   get:
 *     summary: List users in caller's region (Super Admin sees all), paginated
 *     tags: [Identity]
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
 *         schema: { type: string, enum: [createdAt, name, email], default: createdAt }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [SUPER_ADMIN, REGIONAL_ADMIN, SALES_MANAGER, SALES_EXECUTIVE, AUDITOR] }
 *       - in: query
 *         name: regionId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *       - in: query
 *         name: search
 *         description: Matches name / email
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "Paginated result: { data: { items, total, page, pageSize, totalPages } }"
 */
identityRouter.post(
  '/users',
  requireAuth,
  requirePermission(PERMISSIONS.IDENTITY_USER_MANAGE),
  validateBody(createUserSchema),
  asyncHandler(identityController.createUser),
);
identityRouter.get(
  '/users',
  requireAuth,
  requirePermission(PERMISSIONS.IDENTITY_USER_MANAGE),
  validateQuery(listUsersQuerySchema),
  asyncHandler(identityController.listUsers),
);

/**
 * @openapi
 * /users/directory:
 *   get:
 *     summary: Minimal user directory (id/name/email/role) for teammate lookup — mentions, assignment pickers. Any authenticated user, region-scoped.
 *     tags: [Identity]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
identityRouter.get(
  '/users/directory',
  requireAuth,
  asyncHandler(identityController.listUserDirectory),
);

/**
 * @openapi
 * /users/{id}/permissions:
 *   get:
 *     summary: Effective permissions for a user (role defaults + overrides applied)
 *     tags: [Identity]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
identityRouter.get(
  '/users/:id/permissions',
  requireAuth,
  requirePermission(PERMISSIONS.IDENTITY_PERMISSION_OVERRIDE_MANAGE),
  asyncHandler(identityController.getEffectivePermissions),
);

/**
 * @openapi
 * /users/{id}/permission-overrides:
 *   post:
 *     summary: Grant or deny one permission key for one user (feature-level override)
 *     tags: [Identity]
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
 *             required: [permissionKey, effect]
 *             properties:
 *               permissionKey: { type: string, example: "sales.opportunity.reassign" }
 *               effect: { type: string, enum: [GRANT, DENY], example: "GRANT" }
 *               reason: { type: string, example: "trusted exec, temp coverage" }
 *               expiresAt: { type: string, format: date-time }
 *     responses:
 *       201: { description: Created }
 */
identityRouter.post(
  '/users/:id/permission-overrides',
  requireAuth,
  requirePermission(PERMISSIONS.IDENTITY_PERMISSION_OVERRIDE_MANAGE),
  validateBody(permissionOverrideSchema),
  asyncHandler(identityController.setPermissionOverride),
);

/**
 * @openapi
 * /users/{id}/permission-overrides/{permissionKey}:
 *   delete:
 *     summary: Remove a permission override, reverting the user to their role default
 *     tags: [Identity]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: permissionKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: No content }
 */
identityRouter.delete(
  '/users/:id/permission-overrides/:permissionKey',
  requireAuth,
  requirePermission(PERMISSIONS.IDENTITY_PERMISSION_OVERRIDE_MANAGE),
  asyncHandler(identityController.removePermissionOverride),
);

/**
 * @openapi
 * /users/{id}/status:
 *   patch:
 *     summary: Activate or deactivate a user (Super Admin, or Regional Admin within own region)
 *     tags: [Identity]
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [ACTIVE, INACTIVE] }
 *     responses:
 *       200: { description: OK }
 */
identityRouter.patch(
  '/users/:id/status',
  requireAuth,
  requirePermission(PERMISSIONS.IDENTITY_USER_MANAGE),
  validateBody(updateUserStatusSchema),
  asyncHandler(identityController.updateUserStatus),
);
