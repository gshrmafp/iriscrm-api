import { PicklistType } from '@prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors/AppError';
import { picklistRepository } from './repository';
import { CreatePicklistOptionInput, UpdatePicklistOptionInput } from './dto';

export const picklistService = {
  listActive(listType: PicklistType) {
    return picklistRepository.listActive(listType);
  },

  listAll(listType: PicklistType) {
    return picklistRepository.listAll(listType);
  },

  async create(input: CreatePicklistOptionInput) {
    const existing = await picklistRepository.findByCode(input.listType, input.code);
    if (existing) throw new ConflictError('An option with this code already exists for this list');
    return picklistRepository.create(input);
  },

  async update(id: string, input: UpdatePicklistOptionInput) {
    const option = await picklistRepository.findById(id);
    if (!option) throw new NotFoundError('Picklist option not found');
    return picklistRepository.update(id, input);
  },

  // Used by other modules (e.g. Leads) to validate a submitted code against
  // the currently active options for a list — throws if invalid.
  async assertActiveOption(listType: PicklistType, code: string) {
    const option = await picklistRepository.findByCode(listType, code);
    if (!option || !option.active) {
      throw new BadRequestError(`"${code}" is not a valid, active option for ${listType}`);
    }
    return option;
  },
};
