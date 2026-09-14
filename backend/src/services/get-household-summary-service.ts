import type {
  GetHouseholdSummaryData,
  HouseholdSummary,
  TransactionRepository,
} from '../repositories/transaction-repository.js';

export type GetHouseholdSummaryInput = Omit<GetHouseholdSummaryData, 'householdId' | 'requesterId'>;

export class GetHouseholdSummaryService {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    input: GetHouseholdSummaryInput,
  ): Promise<HouseholdSummary> {
    return this.transactions.getSummaryAsMember({ householdId, requesterId, ...input });
  }
}
