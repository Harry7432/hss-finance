import type {
  RecurringTransactionExpenseNature,
  RecurringTransactionRecord,
  RecurringTransactionRepository,
  RecurringTransactionType,
} from '../repositories/recurring-transaction-repository.js';

export interface CreateRecurringTransactionInput {
  type: RecurringTransactionType;
  amount: string;
  categoryId: string | null;
  expenseNature: RecurringTransactionExpenseNature | null;
  description: string | null;
  dayOfMonth: number;
  startDate: string;
}

export class CreateRecurringTransactionService {
  constructor(private readonly recurringTransactions: RecurringTransactionRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    input: CreateRecurringTransactionInput,
  ): Promise<RecurringTransactionRecord> {
    return this.recurringTransactions.createAsMember({
      householdId,
      requesterId,
      ...input,
    });
  }
}
