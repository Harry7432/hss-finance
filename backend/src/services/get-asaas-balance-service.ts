import type { AsaasBalance } from '../integrations/asaas/asaas-client.js';
import { ForbiddenError } from '../errors/forbidden-error.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';

export interface AsaasBalanceClient {
  getBalance(): Promise<AsaasBalance>;
}

export class GetAsaasBalanceService {
  constructor(
    private readonly households: HouseholdRepository,
    private readonly asaasClient: AsaasBalanceClient,
  ) {}

  async execute(householdId: string, requesterId: string): Promise<AsaasBalance> {
    const role = await this.households.findMembershipRole(householdId, requesterId);

    if (!role) {
      throw new ForbiddenError();
    }

    return this.asaasClient.getBalance();
  }
}
