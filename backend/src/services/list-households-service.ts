import type { HouseholdRepository, ListedHousehold } from '../repositories/household-repository.js';

export class ListHouseholdsService {
  constructor(private readonly households: HouseholdRepository) {}

  async execute(userId: string): Promise<ListedHousehold[]> {
    return this.households.listForMember(userId);
  }
}
