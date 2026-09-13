import type { RequestHandler } from 'express';
import { z } from 'zod';

import { InvalidCategoryError } from '../errors/invalid-category-error.js';
import { TransactionNotFoundError } from '../errors/transaction-not-found-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { UpdateTransactionService } from '../services/update-transaction-service.js';
import {
  amountSchema,
  descriptionSchema,
  serializeTransaction,
  transactionDateSchema,
} from './transaction-schemas.js';

const householdIdSchema = z.uuid();
const transactionIdSchema = z.uuid();

const updateTransactionSchema = z
  .strictObject({
    type: z.enum(['income', 'expense']).optional(),
    amount: amountSchema.optional(),
    transactionDate: transactionDateSchema.optional(),
    dueDate: transactionDateSchema.nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
    description: descriptionSchema,
    status: z.enum(['pending', 'paid']).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0);

export function updateTransactionController(service: UpdateTransactionService): RequestHandler {
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

    const parsedTransactionId = transactionIdSchema.safeParse(request.params.transactionId);

    if (!parsedTransactionId.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
      });
      return;
    }

    const parsedPayload = updateTransactionSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
      });
      return;
    }

    try {
      const transaction = await service.execute(
        parsedHouseholdId.data,
        request.auth.userId,
        parsedTransactionId.data,
        {
          ...(parsedPayload.data.type === undefined ? {} : { type: parsedPayload.data.type }),
          ...(parsedPayload.data.amount === undefined ? {} : { amount: parsedPayload.data.amount }),
          ...(parsedPayload.data.transactionDate === undefined
            ? {}
            : { transactionDate: parsedPayload.data.transactionDate }),
          ...(parsedPayload.data.dueDate === undefined
            ? {}
            : { dueDate: parsedPayload.data.dueDate }),
          ...(parsedPayload.data.categoryId === undefined
            ? {}
            : { categoryId: parsedPayload.data.categoryId }),
          ...(parsedPayload.data.description === undefined
            ? {}
            : { description: parsedPayload.data.description || null }),
          ...(parsedPayload.data.status === undefined ? {} : { status: parsedPayload.data.status }),
        },
      );

      response.status(200).json({ data: serializeTransaction(transaction) });
    } catch (error: unknown) {
      if (error instanceof InvalidCategoryError) {
        response.status(400).json({
          error: { code: 'INVALID_CATEGORY', message: error.message },
        });
        return;
      }

      if (error instanceof TransactionNotFoundError) {
        response.status(404).json({
          error: { code: 'TRANSACTION_NOT_FOUND', message: error.message },
        });
        return;
      }

      next(error);
    }
  };
}
