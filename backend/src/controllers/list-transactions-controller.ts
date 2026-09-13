import type { RequestHandler } from 'express';
import { z } from 'zod';

import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { ListTransactionsService } from '../services/list-transactions-service.js';

const householdIdSchema = z.uuid();

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
const pageSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);
const limitSchema = pageSchema.refine((limit) => limit <= 100);
const listTransactionsQuerySchema = z.strictObject({
  type: z.enum(['income', 'expense']).optional(),
  status: z.enum(['pending', 'paid']).optional(),
  categoryId: z.uuid().optional(),
  createdBy: z.uuid().optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  page: pageSchema.optional(),
  limit: limitSchema.optional(),
});

export function listTransactionsController(service: ListTransactionsService): RequestHandler {
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

    const parsedQuery = listTransactionsQuerySchema.safeParse(request.query);

    if (!parsedQuery.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
      });
      return;
    }

    const page = parsedQuery.data.page ?? 1;
    const limit = parsedQuery.data.limit ?? 20;

    if (
      (parsedQuery.data.startDate !== undefined &&
        parsedQuery.data.endDate !== undefined &&
        parsedQuery.data.startDate > parsedQuery.data.endDate) ||
      (page - 1) * limit > Number.MAX_SAFE_INTEGER
    ) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
      });
      return;
    }

    try {
      const result = await service.execute(parsedHouseholdId.data, request.auth.userId, {
        page,
        limit,
        ...(parsedQuery.data.type === undefined ? {} : { type: parsedQuery.data.type }),
        ...(parsedQuery.data.status === undefined ? {} : { status: parsedQuery.data.status }),
        ...(parsedQuery.data.categoryId === undefined
          ? {}
          : { categoryId: parsedQuery.data.categoryId }),
        ...(parsedQuery.data.createdBy === undefined
          ? {}
          : { createdBy: parsedQuery.data.createdBy }),
        ...(parsedQuery.data.startDate === undefined
          ? {}
          : { startDate: parsedQuery.data.startDate }),
        ...(parsedQuery.data.endDate === undefined ? {} : { endDate: parsedQuery.data.endDate }),
      });

      response.status(200).json({
        data: result.records.map((transaction) => ({
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
        })),
        meta: {
          page,
          limit,
          total: result.total,
          totalPages: result.total === 0 ? 0 : Math.ceil(result.total / limit),
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  };
}
