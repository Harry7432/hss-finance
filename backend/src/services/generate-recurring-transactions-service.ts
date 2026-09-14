import type {
  GenerateRecurringTransactionsResult,
  RecurringTransactionRepository,
} from '../repositories/recurring-transaction-repository.js';

export class GenerateRecurringTransactionsService {
  constructor(private readonly recurringTransactions: RecurringTransactionRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    referenceDate: string,
  ): Promise<GenerateRecurringTransactionsResult> {
    return this.recurringTransactions.generateAsMember({
      householdId,
      requesterId,
      referenceDate,
    });
  }
}
