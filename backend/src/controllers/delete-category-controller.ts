import type { RequestHandler } from 'express';
import { z } from 'zod';

import { CategoryInUseError } from '../errors/category-in-use-error.js';
import { CategoryNotFoundError } from '../errors/category-not-found-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { DeleteCategoryService } from '../services/delete-category-service.js';

const idSchema = z.uuid();

export function createDeleteCategoryController(service: DeleteCategoryService): RequestHandler {
  return async (request, response, next) => {
    if (!request.auth) {
      next(new UnauthorizedError());
      return;
    }

    const parsedHouseholdId = idSchema.safeParse(request.params.householdId);
    const parsedCategoryId = idSchema.safeParse(request.params.categoryId);

    if (!parsedHouseholdId.success || !parsedCategoryId.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
      });
      return;
    }

    try {
      await service.execute(parsedHouseholdId.data, request.auth.userId, parsedCategoryId.data);
      response.status(204).send();
    } catch (error: unknown) {
      if (error instanceof CategoryNotFoundError) {
        response.status(404).json({
          error: { code: 'CATEGORY_NOT_FOUND', message: error.message },
        });
        return;
      }

      if (error instanceof CategoryInUseError) {
        response.status(409).json({
          error: { code: 'CATEGORY_IN_USE', message: error.message },
        });
        return;
      }

      next(error);
    }
  };
}
