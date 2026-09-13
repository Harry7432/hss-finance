import { ForbiddenError } from '../errors/forbidden-error.js';
import type { CategoryRepository } from '../repositories/category-repository.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';

export class DeleteCategoryService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly households: HouseholdRepository,
  ) {}

  async execute(householdId: string, requesterId: string, categoryId: string): Promise<void> {
    const role = await this.households.findMembershipRole(householdId, requesterId);

    if (role !== 'owner') {
      throw new ForbiddenError();
    }

    await this.categories.deleteAsOwner(householdId, requesterId, categoryId);
  }
}
