import type { RequestHandler } from 'express';
import { z } from 'zod';

import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { ListRecurringTransactionsService } from '../services/list-recurring-transactions-service.js';
import { serializeRecurringTransaction } from './recurring-transaction-schemas.js';

const householdIdSchema = z.uuid();

const listRecurringTransactionsQuerySchema = z.strictObject({
  isActive: z.enum(['true', 'false']).optional(),
});

export function listRecurringTransactionsController(
  service: ListRecurringTransactionsService,
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

    const parsedQuery = listRecurringTransactionsQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
      });
      return;
    }

    try {
      const recurringTransactions = await service.execute(
        parsedHouseholdId.data,
        request.auth.userId,
        {
          ...(parsedQuery.data.isActive === undefined
            ? {}
            : { isActive: parsedQuery.data.isActive === 'true' }),
        },
      );

      response.status(200).json({
        data: recurringTransactions.map(serializeRecurringTransaction),
      });
    } catch (error: unknown) {
      next(error);
    }
  };
}
