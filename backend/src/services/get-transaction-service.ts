import type {
  TransactionRecord,
  TransactionRepository,
} from '../repositories/transaction-repository.js';

export class GetTransactionService {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    transactionId: string,
  ): Promise<TransactionRecord> {
    return this.transactions.findByIdAsMember({ householdId, requesterId, transactionId });
  }
}
