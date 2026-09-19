import type {
  AsaasFinancialTransactionPage,
  AsaasListFinancialTransactionsOptions,
} from '../integrations/asaas/asaas-client.js';
import { ForbiddenError } from '../errors/forbidden-error.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';

export interface AsaasFinancialTransactionsClient {
  listFinancialTransactions(
    options?: AsaasListFinancialTransactionsOptions,
  ): Promise<AsaasFinancialTransactionPage>;
}

export interface ListAsaasFinancialTransactionsInput extends AsaasListFinancialTransactionsOptions {
  householdId: string;
  requesterId: string;
}

export class ListAsaasFinancialTransactionsService {
  constructor(
    private readonly households: HouseholdRepository,
    private readonly asaasClient: AsaasFinancialTransactionsClient,
  ) {}

  async execute(
    input: ListAsaasFinancialTransactionsInput,
  ): Promise<AsaasFinancialTransactionPage> {
    const role = await this.households.findMembershipRole(input.householdId, input.requesterId);

    if (!role) {
      throw new ForbiddenError();
    }

    const options: AsaasListFinancialTransactionsOptions = {};

    if (input.offset !== undefined) options.offset = input.offset;
    if (input.limit !== undefined) options.limit = input.limit;
    if (input.startDate !== undefined) options.startDate = input.startDate;
    if (input.finishDate !== undefined) options.finishDate = input.finishDate;
    if (input.order !== undefined) options.order = input.order;

    return this.asaasClient.listFinancialTransactions(options);
  }
}
