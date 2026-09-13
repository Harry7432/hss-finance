import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type {
  CreatedHousehold,
  HouseholdRepository,
} from '../repositories/household-repository.js';

export class CreateHouseholdService {
  constructor(private readonly households: HouseholdRepository) {}

  async execute(name: string, creatorId: string): Promise<CreatedHousehold> {
    const household = await this.households.createWithOwner({ name, creatorId });

    if (!household) {
      throw new UnauthorizedError();
    }

    return household;
  }
}
