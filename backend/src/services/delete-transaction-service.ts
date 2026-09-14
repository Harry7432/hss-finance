import type { TransactionRepository } from '../repositories/transaction-repository.js';

export class DeleteTransactionService {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(householdId: string, requesterId: string, transactionId: string): Promise<void> {
    await this.transactions.deleteAsMember({ householdId, requesterId, transactionId });
  }
}
