import { ForbiddenError } from '../errors/forbidden-error.js';
import type {
  CategoryRecord,
  CategoryRepository,
  CategoryType,
} from '../repositories/category-repository.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';

export interface CreateCategoryInput {
  name: string;
  type: CategoryType;
  color: string | null;
  icon: string | null;
}

export class CreateCategoryService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly households: HouseholdRepository,
  ) {}

  async execute(
    householdId: string,
    requesterId: string,
    input: CreateCategoryInput,
  ): Promise<CategoryRecord> {
    const role = await this.households.findMembershipRole(householdId, requesterId);

    if (!role) {
      throw new ForbiddenError();
    }

    return this.categories.create({ householdId, ...input });
  }
}
