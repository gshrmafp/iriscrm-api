import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { EmployeeLifecycleStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import { asyncHandler } from '../../../core/http/asyncHandler';
import { ok } from '../../../core/http/response';
import { requireAuth } from '../../../core/middleware/requireAuth';
import { requirePermission } from '../../../core/middleware/requirePermission';
import { validateQuery } from '../../../core/middleware/validate';
import { UnauthorizedError } from '../../../core/errors/AppError';
import { CROSS_REGION_ROLES, PERMISSIONS } from '../../../config/permissions';

// HR's view of departments. The Sales-side GET /departments is gated on
// sales.query.view, which HR roles don't hold; this one needs hr.employee.view
// and adds headcount. Creating/renaming still goes through /departments
// (department.manage). Region rule matches the Sales list: own region + shared.
export const hrDepartmentsQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const hrDepartmentRouter = Router();

/**
 * @openapi
 * /hrms/departments:
 *   get:
 *     summary: Departments with current headcount (own region + shared; Super Admin sees all)
 *     tags: [HRMS Organization]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: includeInactive, schema: { type: string, enum: ['true', 'false'] } }
 *     responses:
 *       200: { description: OK }
 */
hrDepartmentRouter.get(
  '/hrms/departments',
  requireAuth,
  requirePermission(PERMISSIONS.HR_EMPLOYEE_VIEW),
  validateQuery(hrDepartmentsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError();
    const { includeInactive } = req.query as unknown as z.infer<typeof hrDepartmentsQuerySchema>;
    const where: Prisma.DepartmentWhereInput = {
      deletedAt: null,
      ...(includeInactive ? {} : { active: true }),
      ...(CROSS_REGION_ROLES.includes(req.user.role) ? {} : { OR: [{ regionId: req.user.regionId }, { regionId: null }] }),
    };
    const departments = await prisma.department.findMany({
      where,
      include: {
        region: { select: { id: true, code: true, name: true } },
        _count: { select: { employees: { where: { lifecycleStatus: { not: EmployeeLifecycleStatus.EXITED } } } } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    ok(
      res,
      departments.map(({ _count, ...d }) => ({ ...d, headcount: _count.employees })),
    );
  }),
);
