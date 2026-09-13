import { CategoryNotFoundError } from '../errors/category-not-found-error.js';
import { ForbiddenError } from '../errors/forbidden-error.js';
import type {
  CategoryRecord,
  CategoryRepository,
  UpdateCategoryData,
} from '../repositories/category-repository.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';

export class UpdateCategoryService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly households: HouseholdRepository,
  ) {}

  async execute(
    householdId: string,
    requesterId: string,
    categoryId: string,
    input: UpdateCategoryData,
  ): Promise<CategoryRecord> {
    const role = await this.households.findMembershipRole(householdId, requesterId);

    if (!role) {
      throw new ForbiddenError();
    }

    const category = await this.categories.update(householdId, categoryId, input);

    if (!category) {
      throw new CategoryNotFoundError();
    }

    return category;
  }
}
