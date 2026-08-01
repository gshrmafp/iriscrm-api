import { PriceRuleType } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../../core/errors/AppError';
import { generateId } from '../../../core/utils/idGenerator';
import { catalogRepository } from './repository';
import { CreateCatalogItemInput, CreatePriceRuleInput, ListCatalogItemsQuery, UpdateCatalogItemInput } from './dto';

export const catalogService = {
  listItems(filters: ListCatalogItemsQuery) {
    return catalogRepository.listItems(filters);
  },

  async createItem(input: CreateCatalogItemInput) {
    const existing = await catalogRepository.findItemByCode(input.code);
    if (existing) throw new ConflictError('Catalog item code already exists');
    const id = await generateId('CATALOG');
    return catalogRepository.createItem({ ...input, id });
  },

  async updateItem(id: string, input: UpdateCatalogItemInput) {
    const item = await catalogRepository.findItemById(id);
    if (!item) throw new NotFoundError('Catalog item not found');
    return catalogRepository.updateItem(id, input);
  },

  async createPriceRule(input: CreatePriceRuleInput) {
    const item = await catalogRepository.findItemById(input.catalogItemId);
    if (!item) throw new NotFoundError('Catalog item not found');
    return catalogRepository.createPriceRule(input);
  },

  /**
   * Resolves the price a quotation line should use "right now" for a catalog item
   * in a given region (SM-6.5 — quotes lock in the price valid at issue time).
   * Priority: region-specific REGION_OVERRIDE > global REGION_OVERRIDE > base price,
   * then an active PROMOTIONAL rule (percentage) is applied on top.
   * VOLUME_SLAB / CUSTOMER_TIER are stored (Could-priority, SM-6.4) but not yet
   * auto-applied — a future pricing-engine pass reads them at quote-build time.
   */
  async resolvePrice(catalogItemId: string, regionId: string, at: Date = new Date()) {
    const item = await catalogRepository.findItemById(catalogItemId);
    if (!item) throw new NotFoundError('Catalog item not found');

    const rules = await catalogRepository.listActivePriceRules(catalogItemId, regionId, at);

    const override = rules.find((r) => r.ruleType === PriceRuleType.REGION_OVERRIDE && r.regionId === regionId)
      ?? rules.find((r) => r.ruleType === PriceRuleType.REGION_OVERRIDE && r.regionId === null);

    let price = override ? Number(override.value) : Number(item.basePrice);

    const promo = rules.find((r) => r.ruleType === PriceRuleType.PROMOTIONAL);
    if (promo) price = price * (1 - Number(promo.value) / 100);

    return { catalogItem: item, price };
  },
};
