import type { RequestHandler } from 'express';
import { z } from 'zod';

import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { GetHouseholdCategorySummaryService } from '../services/get-household-category-summary-service.js';
import { transactionDateSchema } from './transaction-schemas.js';

const householdIdSchema = z.uuid();
const categorySummaryQuerySchema = z.strictObject({
  startDate: transactionDateSchema.optional(),
  endDate: transactionDateSchema.optional(),
});

export function getHouseholdCategorySummaryController(
  service: GetHouseholdCategorySummaryService,
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

    const parsedQuery = categorySummaryQuerySchema.safeParse(request.query);

    if (
      !parsedQuery.success ||
      (parsedQuery.data.startDate !== undefined &&
        parsedQuery.data.endDate !== undefined &&
        parsedQuery.data.startDate > parsedQuery.data.endDate)
    ) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
      });
      return;
    }

    try {
      const summary = await service.execute(parsedHouseholdId.data, request.auth.userId, {
        ...(parsedQuery.data.startDate === undefined
          ? {}
          : { startDate: parsedQuery.data.startDate }),
        ...(parsedQuery.data.endDate === undefined ? {} : { endDate: parsedQuery.data.endDate }),
      });

      response.status(200).json({ data: summary });
    } catch (error: unknown) {
      next(error);
    }
  };
}
