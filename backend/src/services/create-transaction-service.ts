import type {
  TransactionExpenseNature,
  TransactionRecord,
  TransactionRepository,
  TransactionStatus,
  TransactionType,
} from '../repositories/transaction-repository.js';

export interface CreateTransactionInput {
  type: TransactionType;
  amount: string;
  transactionDate: string;
  dueDate: string | null;
  categoryId: string | null;
  description: string | null;
  status: TransactionStatus;
  expenseNature: TransactionExpenseNature | null;
}

export class CreateTransactionService {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    input: CreateTransactionInput,
  ): Promise<TransactionRecord> {
    return this.transactions.createAsMember({
      householdId,
      requesterId,
      ...input,
      paidAt: input.status === 'paid' ? new Date() : null,
    });
  }
}
