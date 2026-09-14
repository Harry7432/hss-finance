import type { RequestHandler } from 'express';
import { z } from 'zod';

import { InvalidCategoryError } from '../errors/invalid-category-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { CreateRecurringTransactionService } from '../services/create-recurring-transaction-service.js';
import {
  dayOfMonthSchema,
  serializeRecurringTransaction,
} from './recurring-transaction-schemas.js';
import {
  amountSchema,
  descriptionSchema,
  isExpenseNatureConsistentWithType,
  transactionDateSchema,
  transactionExpenseNatureSchema,
} from './transaction-schemas.js';

const householdIdSchema = z.uuid();

const createRecurringTransactionSchema = z
  .strictObject({
    type: z.enum(['income', 'expense']),
    amount: amountSchema,
    categoryId: z.uuid().nullable().optional(),
    expenseNature: transactionExpenseNatureSchema.nullable().optional(),
    description: descriptionSchema,
    dayOfMonth: dayOfMonthSchema,
    startDate: transactionDateSchema,
  })
  .refine(isExpenseNatureConsistentWithType);

export function createRecurringTransactionController(
  service: CreateRecurringTransactionService,
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

    const parsedPayload = createRecurringTransactionSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
      });
      return;
    }

    try {
      const recurringTransaction = await service.execute(
        parsedHouseholdId.data,
        request.auth.userId,
        {
          type: parsedPayload.data.type,
          amount: parsedPayload.data.amount,
          categoryId: parsedPayload.data.categoryId ?? null,
          description: parsedPayload.data.description || null,
          dayOfMonth: parsedPayload.data.dayOfMonth,
          startDate: parsedPayload.data.startDate,
          expenseNature:
            parsedPayload.data.type === 'expense'
              ? (parsedPayload.data.expenseNature ?? null)
              : null,
        },
      );

      response.status(201).json({ data: serializeRecurringTransaction(recurringTransaction) });
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
