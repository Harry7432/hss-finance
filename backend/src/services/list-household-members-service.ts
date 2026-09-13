import { ForbiddenError } from '../errors/forbidden-error.js';
import type {
  HouseholdRepository,
  ListedHouseholdMember,
} from '../repositories/household-repository.js';

export class ListHouseholdMembersService {
  constructor(private readonly households: HouseholdRepository) {}

  async execute(householdId: string, userId: string): Promise<ListedHouseholdMember[]> {
    const members = await this.households.listMembersForMember(householdId, userId);

    if (!members) {
      throw new ForbiddenError();
    }

    return members;
  }
}
