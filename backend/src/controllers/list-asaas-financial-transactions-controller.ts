import type { RequestHandler } from 'express';
import { z } from 'zod';

import { AsaasClientError } from '../integrations/asaas/asaas-client.error.js';
import type { AsaasClientErrorCode } from '../integrations/asaas/asaas-client.error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { ListAsaasFinancialTransactionsService } from '../services/list-asaas-financial-transactions-service.js';
import { transactionDateSchema } from './transaction-schemas.js';

const householdIdSchema = z.uuid();

const offsetSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .transform(Number)
  .refine(Number.isSafeInteger);
const limitSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine((limit) => Number.isSafeInteger(limit) && limit <= 100);
const orderSchema = z.enum(['asc', 'desc']);
const listFinancialTransactionsQuerySchema = z.strictObject({
  offset: offsetSchema.optional(),
  limit: limitSchema.optional(),
  startDate: transactionDateSchema.optional(),
  finishDate: transactionDateSchema.optional(),
  order: orderSchema.optional(),
});

function toProviderErrorPayload(code: AsaasClientErrorCode): {
  status: number;
  body: { error: { code: string; message: string } };
} {
  if (code === 'rate_limit') {
    return {
      status: 503,
      body: {
        error: {
          code: 'PROVIDER_RATE_LIMITED',
          message: 'The payment provider is temporarily rate limiting requests',
        },
      },
    };
  }

  return {
    status: 502,
    body: {
      error: {
        code: 'PROVIDER_ERROR',
        message: 'The payment provider is temporarily unavailable',
      },
    },
  };
}

export function listAsaasFinancialTransactionsController(
  service: ListAsaasFinancialTransactionsService | undefined,
): RequestHandler {
  return async (request, response, next) => {
    if (!request.auth) {
      next(new UnauthorizedError());
      return;
    }

    if (!service) {
      response.status(503).json({
        error: {
          code: 'PROVIDER_NOT_CONFIGURED',
          message: 'The payment provider is not configured',
        },
      });
      return;
    }

    const parsedHouseholdId = householdIdSchema.safeParse(request.params.householdId);

    if (!parsedHouseholdId.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
      });
      return;
    }

    const parsedQuery = listFinancialTransactionsQuerySchema.safeParse(request.query);

    if (
      !parsedQuery.success ||
      (parsedQuery.data.startDate !== undefined &&
        parsedQuery.data.finishDate !== undefined &&
        parsedQuery.data.startDate > parsedQuery.data.finishDate)
    ) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
      });
      return;
    }

    try {
      const page = await service.execute({
        householdId: parsedHouseholdId.data,
        requesterId: request.auth.userId,
        ...(parsedQuery.data.offset === undefined ? {} : { offset: parsedQuery.data.offset }),
        ...(parsedQuery.data.limit === undefined ? {} : { limit: parsedQuery.data.limit }),
        ...(parsedQuery.data.startDate === undefined
          ? {}
          : { startDate: parsedQuery.data.startDate }),
        ...(parsedQuery.data.finishDate === undefined
          ? {}
          : { finishDate: parsedQuery.data.finishDate }),
        ...(parsedQuery.data.order === undefined ? {} : { order: parsedQuery.data.order }),
      });

      response.status(200).json({
        data: {
          transactions: page.data.map((item) => ({
            id: item.id,
            value: item.value,
            type: item.type,
            date: item.date,
            balance: item.balance,
            description: item.description,
          })),
          totalCount: page.totalCount,
          hasMore: page.hasMore,
          offset: page.offset,
          limit: page.limit,
        },
      });
    } catch (error: unknown) {
      if (error instanceof AsaasClientError) {
        const { status, body } = toProviderErrorPayload(error.code);
        response.status(status).json(body);
        return;
      }

      next(error);
    }
  };
}
