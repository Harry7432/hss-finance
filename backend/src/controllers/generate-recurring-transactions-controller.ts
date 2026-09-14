import type { RequestHandler } from 'express';
import { z } from 'zod';

import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { GenerateRecurringTransactionsService } from '../services/generate-recurring-transactions-service.js';
import { transactionDateSchema } from './transaction-schemas.js';

const householdIdSchema = z.uuid();

const generateRecurringTransactionsSchema = z.strictObject({
  referenceDate: transactionDateSchema,
});

export function generateRecurringTransactionsController(
  service: GenerateRecurringTransactionsService,
): RequestHandler {
  return async (request, response, next) => {
    if (!request.auth) {
      next(new UnauthorizedError());
      return;
    }

    const parsedHouseholdId = householdIdSchema.safeParse(request.params.householdId);

    if (!parsedHouseholdId.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
      });
      return;
    }

    const parsedPayload = generateRecurringTransactionsSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
      });
      return;
    }

    try {
      const result = await service.execute(
        parsedHouseholdId.data,
        request.auth.userId,
        parsedPayload.data.referenceDate,
      );

      response.status(200).json({ data: result });
    } catch (error: unknown) {
      next(error);
    }
  };
}
