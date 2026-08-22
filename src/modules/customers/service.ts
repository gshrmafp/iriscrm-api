import { AuthUser } from '../../core/middleware/types';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../core/errors/AppError';
import { CROSS_REGION_ROLES } from '../../config/permissions';
import { assertSameRegionOrElevated } from '../../core/rbac/regionScope';
import { generateId } from '../../core/utils/idGenerator';
import { identityRepository } from '../identity/repository';
import { customerRepository } from './repository';
import { CreateCustomerInput, ListCustomersQuery } from './dto';

function buildCustomerScopeWhere(actor: AuthUser) {
  return CROSS_REGION_ROLES.includes(actor.role) ? {} : { regionId: actor.regionId };
}

export const customerService = {
  async create(actor: AuthUser, input: CreateCustomerInput) {
    let regionId = actor.regionId;
    if (input.regionId && input.regionId !== actor.regionId) {
      if (!CROSS_REGION_ROLES.includes(actor.role) && actor.role !== 'REGIONAL_ADMIN') {
        throw new ForbiddenError('Only an Admin can assign a customer to another region');
      }
      regionId = input.regionId;
    }

    const region = await identityRepository.findRegionById(regionId);
    if (!region) throw new BadRequestError('Region not found');

    const duplicate = await customerRepository.findDuplicateByName(regionId, input.name);
    if (duplicate) throw new BadRequestError('A customer with this name already exists in this region');

    const id = await generateId('CUSTOMER');
    return customerRepository.create({ ...input, id, regionId, createdBy: actor.id });
  },

  async list(actor: AuthUser, filters: ListCustomersQuery) {
    return customerRepository.list(buildCustomerScopeWhere(actor), filters);
  },

  async get(id: string, actor: AuthUser) {
    const customer = await customerRepository.findById(id);
    if (!customer) throw new NotFoundError('Customer not found');
    assertSameRegionOrElevated(actor, customer.regionId);
    return customer;
  },
};
