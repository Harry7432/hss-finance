import { ForbiddenError } from '../errors/forbidden-error.js';
import type {
  CategoryRecord,
  CategoryRepository,
  CategoryType,
} from '../repositories/category-repository.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';

export class ListCategoriesService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly households: HouseholdRepository,
  ) {}

  async execute(
    householdId: string,
    requesterId: string,
    type?: CategoryType,
  ): Promise<CategoryRecord[]> {
    const role = await this.households.findMembershipRole(householdId, requesterId);

    if (!role) {
      throw new ForbiddenError();
    }

    return this.categories.list(householdId, type);
  }
}
