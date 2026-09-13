import type { RequestHandler } from 'express';
import { z } from 'zod';

import { CategoryAlreadyExistsError } from '../errors/category-already-exists-error.js';
import { CategoryNotFoundError } from '../errors/category-not-found-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { UpdateCategoryData } from '../repositories/category-repository.js';
import type { UpdateCategoryService } from '../services/update-category-service.js';

const idSchema = z.uuid();
const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const updateCategorySchema = z
  .strictObject({
    name: z.string().trim().min(1).optional(),
    color: colorSchema.nullable().optional(),
    icon: z.string().nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0);

export function createUpdateCategoryController(service: UpdateCategoryService): RequestHandler {
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

    const parsedPayload = updateCategorySchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
      });
      return;
    }

    try {
      const input: UpdateCategoryData = {};

      if (parsedPayload.data.name !== undefined) {
        input.name = parsedPayload.data.name;
      }

      if (parsedPayload.data.color !== undefined) {
        input.color = parsedPayload.data.color;
      }

      if (parsedPayload.data.icon !== undefined) {
        input.icon = parsedPayload.data.icon;
      }

      const category = await service.execute(
        parsedHouseholdId.data,
        request.auth.userId,
        parsedCategoryId.data,
        input,
      );

      response.status(200).json({
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
      if (error instanceof CategoryNotFoundError) {
        response.status(404).json({
          error: { code: 'CATEGORY_NOT_FOUND', message: error.message },
        });
        return;
      }

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
