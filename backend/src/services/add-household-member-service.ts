import { ForbiddenError } from '../errors/forbidden-error.js';
import { UserNotFoundError } from '../errors/user-not-found-error.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';
import type { UserRepository } from '../repositories/user-repository.js';

export interface AddedHouseholdMemberResult {
  userId: string;
  name: string;
  email: string;
  role: 'member';
  joinedAt: Date;
}

export class AddHouseholdMemberService {
  constructor(
    private readonly households: HouseholdRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(
    householdId: string,
    requesterId: string,
    email: string,
  ): Promise<AddedHouseholdMemberResult> {
    const requesterRole = await this.households.findMembershipRole(householdId, requesterId);

    if (requesterRole !== 'owner') {
      throw new ForbiddenError();
    }

    const targetUser = await this.users.findByEmail(email);

    if (!targetUser) {
      throw new UserNotFoundError();
    }

    const membership = await this.households.addMemberAsOwner(
      householdId,
      requesterId,
      targetUser.id,
    );

    return {
      userId: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      role: membership.role,
      joinedAt: membership.joinedAt,
    };
  }
}
