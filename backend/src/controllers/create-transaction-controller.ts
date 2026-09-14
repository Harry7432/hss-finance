import type { RequestHandler } from 'express';
import { z } from 'zod';

import { InvalidCategoryError } from '../errors/invalid-category-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { CreateTransactionService } from '../services/create-transaction-service.js';
import {
  amountSchema,
  descriptionSchema,
  isExpenseNatureConsistentWithType,
  serializeTransaction,
  transactionDateSchema,
  transactionExpenseNatureSchema,
} from './transaction-schemas.js';

const householdIdSchema = z.uuid();

const createTransactionSchema = z
  .strictObject({
    type: z.enum(['income', 'expense']),
    amount: amountSchema,
    transactionDate: transactionDateSchema,
    dueDate: transactionDateSchema.nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
    description: descriptionSchema,
    status: z.enum(['pending', 'paid']).optional(),
    expenseNature: transactionExpenseNatureSchema.nullable().optional(),
  })
  .refine(isExpenseNatureConsistentWithType);

export function createTransactionController(service: CreateTransactionService): RequestHandler {
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

    const parsedPayload = createTransactionSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
      });
      return;
    }

    try {
      const transaction = await service.execute(parsedHouseholdId.data, request.auth.userId, {
        type: parsedPayload.data.type,
        amount: parsedPayload.data.amount,
        transactionDate: parsedPayload.data.transactionDate,
        dueDate: parsedPayload.data.dueDate ?? null,
        categoryId: parsedPayload.data.categoryId ?? null,
        description: parsedPayload.data.description || null,
        status: parsedPayload.data.status ?? 'pending',
        expenseNature:
          parsedPayload.data.type === 'expense' ? (parsedPayload.data.expenseNature ?? null) : null,
      });

      response.status(201).json({ data: serializeTransaction(transaction) });
    } catch (error: unknown) {
      if (error instanceof InvalidCategoryError) {
        response.status(400).json({
          error: { code: 'INVALID_CATEGORY', message: error.message },
        });
        return;
      }

      next(error);
    }
  };
}
