import type { RequestHandler } from 'express';
import { z } from 'zod';

import { InvalidCategoryError } from '../errors/invalid-category-error.js';
import { InvalidExpenseNatureError } from '../errors/invalid-expense-nature-error.js';
import { RecurringTransactionNotFoundError } from '../errors/recurring-transaction-not-found-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { UpdateRecurringTransactionService } from '../services/update-recurring-transaction-service.js';
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
const recurringTransactionIdSchema = z.uuid();

const updateRecurringTransactionSchema = z
  .strictObject({
    type: z.enum(['income', 'expense']).optional(),
    amount: amountSchema.optional(),
    categoryId: z.uuid().nullable().optional(),
    expenseNature: transactionExpenseNatureSchema.nullable().optional(),
    description: descriptionSchema,
    dayOfMonth: dayOfMonthSchema.optional(),
    isActive: z.boolean().optional(),
    startDate: transactionDateSchema.optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0)
  .refine(isExpenseNatureConsistentWithType);

export function updateRecurringTransactionController(
  service: UpdateRecurringTransactionService,
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

    const parsedRecurringTransactionId = recurringTransactionIdSchema.safeParse(
      request.params.recurringTransactionId,
    );

    if (!parsedRecurringTransactionId.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
      });
      return;
    }

    const parsedPayload = updateRecurringTransactionSchema.safeParse(request.body);

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
        parsedRecurringTransactionId.data,
        {
          ...(parsedPayload.data.type === undefined ? {} : { type: parsedPayload.data.type }),
          ...(parsedPayload.data.amount === undefined ? {} : { amount: parsedPayload.data.amount }),
          ...(parsedPayload.data.categoryId === undefined
            ? {}
            : { categoryId: parsedPayload.data.categoryId }),
          ...(parsedPayload.data.expenseNature === undefined
            ? {}
            : { expenseNature: parsedPayload.data.expenseNature }),
          ...(parsedPayload.data.description === undefined
            ? {}
            : { description: parsedPayload.data.description || null }),
          ...(parsedPayload.data.dayOfMonth === undefined
            ? {}
            : { dayOfMonth: parsedPayload.data.dayOfMonth }),
          ...(parsedPayload.data.isActive === undefined
            ? {}
            : { isActive: parsedPayload.data.isActive }),
          ...(parsedPayload.data.startDate === undefined
            ? {}
            : { startDate: parsedPayload.data.startDate }),
        },
      );

      response.status(200).json({ data: serializeRecurringTransaction(recurringTransaction) });
    } catch (error: unknown) {
      if (error instanceof InvalidCategoryError) {
        response.status(400).json({
          error: { code: 'INVALID_CATEGORY', message: error.message },
        });
        return;
      }

      if (error instanceof InvalidExpenseNatureError) {
        response.status(400).json({
          error: { code: 'INVALID_EXPENSE_NATURE', message: error.message },
        });
        return;
      }

      if (error instanceof RecurringTransactionNotFoundError) {
        response.status(404).json({
          error: { code: 'RECURRING_TRANSACTION_NOT_FOUND', message: error.message },
        });
        return;
      }

      next(error);
    }
  };
}
