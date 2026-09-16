import type { RequestHandler } from 'express';
import { z } from 'zod';

import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { GetHouseholdMonthlySummaryService } from '../services/get-household-monthly-summary-service.js';

const householdIdSchema = z.uuid();
const monthlySummaryQuerySchema = z.strictObject({});

export function getHouseholdMonthlySummaryController(
  service: GetHouseholdMonthlySummaryService,
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

    const parsedQuery = monthlySummaryQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
      });
      return;
    }

    try {
      const summary = await service.execute(parsedHouseholdId.data, request.auth.userId);

      response.status(200).json({ data: summary });
    } catch (error: unknown) {
      next(error);
    }
  };
}
