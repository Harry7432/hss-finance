import type {
  RecurringTransactionRecord,
  RecurringTransactionRepository,
} from '../repositories/recurring-transaction-repository.js';

export interface ListRecurringTransactionsInput {
  isActive?: boolean;
}

export class ListRecurringTransactionsService {
  constructor(private readonly recurringTransactions: RecurringTransactionRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    input: ListRecurringTransactionsInput,
  ): Promise<RecurringTransactionRecord[]> {
    return this.recurringTransactions.listAsMember({
      householdId,
      requesterId,
      ...input,
    });
  }
}
