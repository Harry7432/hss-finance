import type {
  GetHouseholdUserSummaryData,
  HouseholdUserSummaryEntry,
  TransactionRepository,
} from '../repositories/transaction-repository.js';

export type GetHouseholdUserSummaryInput = Omit<
  GetHouseholdUserSummaryData,
  'householdId' | 'requesterId'
>;

export class GetHouseholdUserSummaryService {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    input: GetHouseholdUserSummaryInput,
  ): Promise<HouseholdUserSummaryEntry[]> {
    return this.transactions.getUserSummaryAsMember({ householdId, requesterId, ...input });
  }
}
