import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { EmployeeLifecycleStatus, Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import { asyncHandler } from '../../../core/http/asyncHandler';
import { ok } from '../../../core/http/response';
import { requireAuth } from '../../../core/middleware/requireAuth';
import { requirePermission } from '../../../core/middleware/requirePermission';
import { validateQuery } from '../../../core/middleware/validate';
import { UnauthorizedError } from '../../../core/errors/AppError';
import { PERMISSIONS } from '../../../config/permissions';
import { employeeWhereForScope, resolveHrScope } from '../_shared/scope';

export const orgChartQuerySchema = z.object({
  regionId: z.string().optional(),
  departmentId: z.string().optional(),
});

export const orgChartRouter = Router();

/**
 * @openapi
 * /hrms/org-chart:
 *   get:
 *     summary: Reporting structure as a flat node list (build the tree from reportingToId). Scoped like the directory; exited and inactive people are left out. A node whose manager is outside the result is a root.
 *     tags: [HRMS Organization]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: regionId, schema: { type: string } }
 *       - { in: query, name: departmentId, schema: { type: string } }
 *     responses:
 *       200: { description: OK }
 */
orgChartRouter.get(
  '/hrms/org-chart',
  requireAuth,
  requirePermission(PERMISSIONS.HR_EMPLOYEE_VIEW),
  validateQuery(orgChartQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { regionId, departmentId } = req.query as z.infer<typeof orgChartQuerySchema>;
    const scope = await resolveHrScope(req.user);
    const where: Prisma.EmployeeWhereInput = {
      AND: [
        employeeWhereForScope(scope),
        { lifecycleStatus: { not: EmployeeLifecycleStatus.EXITED } },
        { user: { status: UserStatus.ACTIVE, ...(regionId ? { regionId } : {}) } },
        departmentId ? { departmentId } : {},
      ],
    };
    const rows = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        userId: true,
        lifecycleStatus: true,
        designation: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        user: { select: { name: true, role: true, reportingToId: true, region: { select: { id: true, name: true } } } },
      },
      orderBy: { user: { name: 'asc' } },
    });
    ok(
      res,
      rows.map((r) => ({
        employeeId: r.id,
        userId: r.userId,
        name: r.user.name,
        role: r.user.role,
        reportingToId: r.user.reportingToId,
        lifecycleStatus: r.lifecycleStatus,
        designation: r.designation,
        department: r.department,
        region: r.user.region,
      })),
    );
  }),
);
