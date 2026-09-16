import type {
  GetHouseholdCategorySummaryData,
  HouseholdCategorySummaryEntry,
  TransactionRepository,
} from '../repositories/transaction-repository.js';

export type GetHouseholdCategorySummaryInput = Omit<
  GetHouseholdCategorySummaryData,
  'householdId' | 'requesterId'
>;

export class GetHouseholdCategorySummaryService {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    input: GetHouseholdCategorySummaryInput,
  ): Promise<HouseholdCategorySummaryEntry[]> {
    return this.transactions.getCategorySummaryAsMember({ householdId, requesterId, ...input });
  }
}
