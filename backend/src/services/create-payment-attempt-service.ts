import type { PaymentAttemptKind } from '../database/entities/payment-attempt.entity.js';
import type {
  PaymentAttemptRecord,
  PaymentAttemptRepository,
} from '../repositories/payment-attempt-repository.js';

export interface CreatePaymentAttemptInput {
  transactionId: string;
  kind: PaymentAttemptKind;
  requestedAmount: string;
}

export class CreatePaymentAttemptService {
  constructor(private readonly paymentAttempts: PaymentAttemptRepository) {}

  async execute(
    householdId: string,
    requesterId: string,
    input: CreatePaymentAttemptInput,
  ): Promise<PaymentAttemptRecord> {
    return this.paymentAttempts.createPaymentAttempt({
      householdId,
      requesterId,
      ...input,
    });
  }
}
