import type {
  ListTransactionsData,
  ListTransactionsResult,
  TransactionRepository,
} from '../repositories/transaction-repository.js';

export type ListTransactionsInput = Omit<ListTransactionsData, 'householdId' | 'requesterId'>;

export class ListTransactionsService {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    input: ListTransactionsInput,
  ): Promise<ListTransactionsResult> {
    return this.transactions.listAsMember({ householdId, requesterId, ...input });
  }
}
