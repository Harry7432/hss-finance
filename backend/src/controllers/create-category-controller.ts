import type { RequestHandler } from 'express';
import { z } from 'zod';

import { CategoryAlreadyExistsError } from '../errors/category-already-exists-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { CreateCategoryService } from '../services/create-category-service.js';

const householdIdSchema = z.uuid();
const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const createCategorySchema = z.strictObject({
  name: z.string().trim().min(1),
  type: z.enum(['income', 'expense']),
  color: colorSchema.nullable().optional(),
  icon: z.string().nullable().optional(),
});

export function createCategoryController(service: CreateCategoryService): RequestHandler {
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

    const parsedPayload = createCategorySchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
      });
      return;
    }

    try {
      const category = await service.execute(parsedHouseholdId.data, request.auth.userId, {
        name: parsedPayload.data.name,
        type: parsedPayload.data.type,
        color: parsedPayload.data.color ?? null,
        icon: parsedPayload.data.icon ?? null,
      });

      response.status(201).json({
        data: {
          id: category.id,
          name: category.name,
          type: category.type,
          color: category.color,
          icon: category.icon,
          isDefault: category.isDefault,
          createdAt: category.createdAt.toISOString(),
          updatedAt: category.updatedAt.toISOString(),
        },
      });
    } catch (error: unknown) {
      if (error instanceof CategoryAlreadyExistsError) {
        response.status(409).json({
          error: { code: 'CATEGORY_ALREADY_EXISTS', message: error.message },
        });
        return;
      }

      next(error);
    }
  };
}
