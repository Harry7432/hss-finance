import type { RequestHandler } from 'express';
import { z } from 'zod';

import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { CreateHouseholdService } from '../services/create-household-service.js';

const createHouseholdSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
});

export function createHouseholdController(service: CreateHouseholdService): RequestHandler {
  return async (request, response, next) => {
    if (!request.auth) {
      next(new UnauthorizedError());
      return;
    }

    const parsedPayload = createHouseholdSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload',
        },
      });
      return;
    }

    try {
      const household = await service.execute(parsedPayload.data.name, request.auth.userId);
      response.status(201).json({
        data: {
          id: household.id,
          name: household.name,
          currencyCode: household.currencyCode,
          role: household.role,
          createdAt: household.createdAt.toISOString(),
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  };
}
