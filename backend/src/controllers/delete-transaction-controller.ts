import type { RequestHandler } from 'express';
import { z } from 'zod';

import { TransactionNotFoundError } from '../errors/transaction-not-found-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { DeleteTransactionService } from '../services/delete-transaction-service.js';

const householdIdSchema = z.uuid();
const transactionIdSchema = z.uuid();

export function deleteTransactionController(service: DeleteTransactionService): RequestHandler {
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
      await service.execute(parsedHouseholdId.data, request.auth.userId, parsedTransactionId.data);
      response.status(204).send();
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
