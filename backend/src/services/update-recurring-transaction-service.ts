import type {
  RecurringTransactionExpenseNature,
  RecurringTransactionRecord,
  RecurringTransactionRepository,
  RecurringTransactionType,
} from '../repositories/recurring-transaction-repository.js';

export interface UpdateRecurringTransactionInput {
  type?: RecurringTransactionType;
  amount?: string;
  categoryId?: string | null;
  expenseNature?: RecurringTransactionExpenseNature | null;
  description?: string | null;
  dayOfMonth?: number;
  isActive?: boolean;
  startDate?: string;
}

export class UpdateRecurringTransactionService {
  constructor(private readonly recurringTransactions: RecurringTransactionRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    recurringTransactionId: string,
    input: UpdateRecurringTransactionInput,
  ): Promise<RecurringTransactionRecord> {
    return this.recurringTransactions.updateAsMember({
      householdId,
      requesterId,
      recurringTransactionId,
      ...input,
    });
  }
}
