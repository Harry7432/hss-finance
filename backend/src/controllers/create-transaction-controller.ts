import type { RequestHandler } from 'express';
import { z } from 'zod';

import { InvalidCategoryError } from '../errors/invalid-category-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { CreateTransactionService } from '../services/create-transaction-service.js';

const householdIdSchema = z.uuid();
const amountSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/)
  .refine((amount) => !/^0(?:\.0{1,2})?$/.test(amount))
  .transform((amount) => {
    const [integer, fraction = ''] = amount.split('.');
    return `${integer}.${fraction.padEnd(2, '0')}`;
  });

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return (
    year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= (daysPerMonth[month - 1] ?? 0)
  );
}

const dateSchema = z.string().refine(isValidCalendarDate);
const createTransactionSchema = z.strictObject({
  type: z.enum(['income', 'expense']),
  amount: amountSchema,
  transactionDate: dateSchema,
  dueDate: dateSchema.nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  description: z.string().trim().max(255).nullable().optional(),
  status: z.enum(['pending', 'paid']).optional(),
});

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
      });

      response.status(201).json({
        data: {
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          transactionDate: transaction.transactionDate,
          dueDate: transaction.dueDate,
          categoryId: transaction.categoryId,
          description: transaction.description,
          status: transaction.status,
          paidAt: transaction.paidAt?.toISOString() ?? null,
          source: transaction.source,
          createdBy: transaction.createdBy,
          createdAt: transaction.createdAt.toISOString(),
          updatedAt: transaction.updatedAt.toISOString(),
        },
      });
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
