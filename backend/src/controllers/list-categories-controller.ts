import type { RequestHandler } from 'express';
import { z } from 'zod';

import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { ListCategoriesService } from '../services/list-categories-service.js';

const householdIdSchema = z.uuid();
const listCategoriesQuerySchema = z.strictObject({
  type: z.enum(['income', 'expense']).optional(),
});

export function createListCategoriesController(service: ListCategoriesService): RequestHandler {
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

    const parsedQuery = listCategoriesQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
      });
      return;
    }

    try {
      const categories = await service.execute(
        parsedHouseholdId.data,
        request.auth.userId,
        parsedQuery.data.type,
      );

      response.status(200).json({
        data: categories.map((category) => ({
          id: category.id,
          name: category.name,
          type: category.type,
          color: category.color,
          icon: category.icon,
          isDefault: category.isDefault,
          createdAt: category.createdAt.toISOString(),
          updatedAt: category.updatedAt.toISOString(),
        })),
      });
    } catch (error: unknown) {
      next(error);
    }
  };
}
