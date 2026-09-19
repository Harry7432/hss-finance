import type { RequestHandler } from 'express';
import { z } from 'zod';

import type { PaymentAttemptRecord } from '../repositories/payment-attempt-repository.js';
import { TransactionNotFoundError } from '../errors/transaction-not-found-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { GetPaymentAttemptService } from '../services/get-payment-attempt-service.js';

const householdIdSchema = z.uuid();
const transactionIdSchema = z.uuid();

// Deliberately excludes failureReason (internal diagnostic text), providerResourceId,
// idempotencyKey and requestedAmount — the frontend only needs enough to render a friendly
// status label and knows the amount from the Transaction itself.
function serializePaymentAttempt(attempt: PaymentAttemptRecord): {
  id: string;
  status: PaymentAttemptRecord['status'];
  kind: PaymentAttemptRecord['kind'];
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
} {
  return {
    id: attempt.id,
    status: attempt.status,
    kind: attempt.kind,
    createdAt: attempt.createdAt.toISOString(),
    updatedAt: attempt.updatedAt.toISOString(),
    confirmedAt: attempt.confirmedAt?.toISOString() ?? null,
  };
}

export function getPaymentAttemptController(service: GetPaymentAttemptService): RequestHandler {
  return async (request, response, next) => {
    if (!request.auth) {
      next(new UnauthorizedError());
      return;
    }

    const parsedHouseholdId = householdIdSchema.safeParse(request.params.householdId);
    const parsedTransactionId = transactionIdSchema.safeParse(request.params.transactionId);

    if (!parsedHouseholdId.success || !parsedTransactionId.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
      });
      return;
    }

    try {
      const attempt = await service.execute(
        parsedHouseholdId.data,
        request.auth.userId,
        parsedTransactionId.data,
      );

      response.status(200).json({ data: attempt ? serializePaymentAttempt(attempt) : null });
    } catch (error: unknown) {
      if (error instanceof TransactionNotFoundError) {
        response.status(404).json({
          error: { code: 'TRANSACTION_NOT_FOUND', message: error.message },
        });
        return;
      }

      next(error);
    }
  };
}
