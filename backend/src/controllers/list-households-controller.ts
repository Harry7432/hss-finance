import type { RequestHandler } from 'express';

import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { ListHouseholdsService } from '../services/list-households-service.js';

export function createListHouseholdsController(service: ListHouseholdsService): RequestHandler {
  return async (request, response, next) => {
    if (!request.auth) {
      next(new UnauthorizedError());
      return;
    }

    try {
      const households = await service.execute(request.auth.userId);
      response.status(200).json({
        data: households.map((household) => ({
          id: household.id,
          name: household.name,
          currencyCode: household.currencyCode,
          role: household.role,
          createdAt: household.createdAt.toISOString(),
        })),
      });
    } catch (error: unknown) {
      next(error);
    }
  };
}
