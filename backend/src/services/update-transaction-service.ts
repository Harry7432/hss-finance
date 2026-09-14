import type {
  TransactionExpenseNature,
  TransactionRecord,
  TransactionRepository,
  TransactionStatus,
  TransactionType,
} from '../repositories/transaction-repository.js';

export interface UpdateTransactionInput {
  type?: TransactionType;
  amount?: string;
  transactionDate?: string;
  dueDate?: string | null;
  categoryId?: string | null;
  description?: string | null;
  status?: TransactionStatus;
  expenseNature?: TransactionExpenseNature | null;
}

export class UpdateTransactionService {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    transactionId: string,
    input: UpdateTransactionInput,
  ): Promise<TransactionRecord> {
    return this.transactions.updateAsMember({
      householdId,
      requesterId,
      transactionId,
      ...input,
    });
  }
}
