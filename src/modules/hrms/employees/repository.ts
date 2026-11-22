import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/db/prisma';
import { ListEmployeesQuery } from './dto';

// Shape returned for directory rows and profile headers. Never includes
// statutory data — that is fetched separately behind its own checks.
export const employeeInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      regionId: true,
      region: { select: { id: true, code: true, name: true } },
      reportingTo: { select: { id: true, name: true } },
    },
  },
  department: { select: { id: true, code: true, name: true } },
  designation: { select: { id: true, code: true, name: true } },
} satisfies Prisma.EmployeeInclude;

export type EmployeeWithRelations = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

export const employeeRepository = {
  async list(scopeWhere: Prisma.EmployeeWhereInput, filters: ListEmployeesQuery) {
    const { page, pageSize, sortBy, sortOrder, search, departmentId, designationId, regionId, lifecycleStatus, employmentType, includeExited } = filters;

    const and: Prisma.EmployeeWhereInput[] = [scopeWhere];
    if (departmentId) and.push({ departmentId });
    if (designationId) and.push({ designationId });
    if (regionId) and.push({ user: { regionId } });
    if (lifecycleStatus) and.push({ lifecycleStatus });
    else if (!includeExited) and.push({ lifecycleStatus: { not: 'EXITED' } });
    if (employmentType) and.push({ employmentType });
    if (search) {
      and.push({
        OR: [
          { user: { name: { contains: search, mode: 'insensitive' } } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
          { userId: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      });
    }
    const where: Prisma.EmployeeWhereInput = { AND: and };

    const orderBy: Prisma.EmployeeOrderByWithRelationInput[] =
      sortBy === 'name'
        ? [{ user: { name: sortOrder } }, { id: 'asc' }]
        : [{ [sortBy]: { sort: sortOrder, nulls: 'last' } }, { id: 'asc' }];

    const [items, total] = await Promise.all([
      prisma.employee.findMany({ where, include: employeeInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.employee.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  // Accepts either the Employee id or the employee code (User.id, e.g. EMP042)
  // so existing user links (/admin/users/EMP042) map straight across.
  findByIdOrCode(idOrCode: string) {
    return prisma.employee.findFirst({
      where: { OR: [{ id: idOrCode }, { userId: idOrCode }] },
      include: employeeInclude,
    });
  },

  findByUserId(userId: string) {
    return prisma.employee.findUnique({ where: { userId }, include: employeeInclude });
  },

  findStatutory(employeeId: string) {
    return prisma.employeeStatutory.findUnique({ where: { employeeId } });
  },

  listLifecycleEvents(employeeId: string) {
    return prisma.employeeLifecycleEvent.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' } });
  },

  listDocuments(employeeId: string) {
    return prisma.hrDocument.findMany({ where: { employeeId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
  },

  findDocument(employeeId: string, documentId: string) {
    return prisma.hrDocument.findFirst({ where: { id: documentId, employeeId, deletedAt: null } });
  },
};
