import type {
  PaymentAttemptRecord,
  PaymentAttemptRepository,
} from '../repositories/payment-attempt-repository.js';

export class GetPaymentAttemptService {
  constructor(private readonly paymentAttempts: PaymentAttemptRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    transactionId: string,
  ): Promise<PaymentAttemptRecord | null> {
    return this.paymentAttempts.findLatestForTransactionAsMember({
      householdId,
      requesterId,
      transactionId,
    });
  }
}
