import { Role } from '@prisma/client';
import { AuthUser } from '../../core/middleware/types';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../core/errors/AppError';
import { CROSS_REGION_ROLES } from '../../config/permissions';
import { departmentRepository } from './repository';
import { AddMemberInput, CreateDepartmentInput, UpdateDepartmentInput } from './dto';

async function loadOrThrow(id: string) {
  const department = await departmentRepository.findById(id);
  if (!department) throw new NotFoundError('Department not found');
  return department;
}

export const departmentService = {
  // Admin+ only (route-gated by DEPARTMENT_MANAGE). Omitting regionId creates a
  // cross-region/shared department (e.g. Accounts HQ) — only a Super Admin may
  // do that; a Regional Admin always creates within their own region.
  create(actor: AuthUser, input: CreateDepartmentInput) {
    if (!input.regionId) {
      if (!CROSS_REGION_ROLES.includes(actor.role)) {
        return departmentRepository.create({ ...input, regionId: actor.regionId });
      }
      return departmentRepository.create(input);
    }
    if (!CROSS_REGION_ROLES.includes(actor.role) && input.regionId !== actor.regionId) {
      throw new ForbiddenError('Cannot create a department outside your region');
    }
    return departmentRepository.create(input);
  },

  // Visible to every authenticated user (needed for query/comment assignment
  // pickers) — region-scoped departments plus any shared (regionId: null) ones.
  list(actor: AuthUser) {
    if (CROSS_REGION_ROLES.includes(actor.role as Role)) {
      return departmentRepository.list({});
    }
    return departmentRepository.list({ OR: [{ regionId: actor.regionId }, { regionId: null }] });
  },

  get(id: string) {
    return loadOrThrow(id);
  },

  async update(id: string, actor: AuthUser, input: UpdateDepartmentInput) {
    const department = await loadOrThrow(id);
    if (department.regionId && !CROSS_REGION_ROLES.includes(actor.role) && department.regionId !== actor.regionId) {
      throw new ForbiddenError('Cannot manage a department outside your region');
    }
    return departmentRepository.update(id, input);
  },

  async addMember(id: string, actor: AuthUser, input: AddMemberInput) {
    const department = await loadOrThrow(id);
    if (department.regionId && !CROSS_REGION_ROLES.includes(actor.role) && department.regionId !== actor.regionId) {
      throw new ForbiddenError('Cannot manage a department outside your region');
    }
    return departmentRepository.addMember(id, input.userId, input.roleInDept);
  },

  async removeMember(id: string, actor: AuthUser, userId: string) {
    const department = await loadOrThrow(id);
    if (department.regionId && !CROSS_REGION_ROLES.includes(actor.role) && department.regionId !== actor.regionId) {
      throw new ForbiddenError('Cannot manage a department outside your region');
    }
    const membership = await departmentRepository.findMembership(id, userId);
    if (!membership) throw new BadRequestError('User is not a member of this department');
    return departmentRepository.removeMember(id, userId);
  },
};
