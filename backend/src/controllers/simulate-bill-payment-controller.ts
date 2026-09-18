import type { RequestHandler } from 'express';
import { z } from 'zod';

import { AsaasClientError } from '../integrations/asaas/asaas-client.error.js';
import type { AsaasClientErrorCode } from '../integrations/asaas/asaas-client.error.js';
import { TransactionAlreadyPaidError } from '../errors/transaction-already-paid-error.js';
import { TransactionNotFoundError } from '../errors/transaction-not-found-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { SimulateBillPaymentService } from '../services/simulate-bill-payment-service.js';

const householdIdSchema = z.uuid();
const transactionIdSchema = z.uuid();

const simulateBillPaymentSchema = z.strictObject({
  identificationField: z.string().trim().min(1),
});

function toProviderErrorPayload(code: AsaasClientErrorCode): {
  status: number;
  body: { error: { code: string; message: string } };
} {
  if (code === 'invalid_request') {
    return {
      status: 422,
      body: {
        error: {
          code: 'INVALID_BILL',
          message: 'The bill could not be validated by the payment provider',
        },
      },
    };
  }

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

export function simulateBillPaymentController(
  service: SimulateBillPaymentService | undefined,
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
          message: 'The bill payment provider is not configured',
        },
      });
      return;
    }

    const parsedHouseholdId = householdIdSchema.safeParse(request.params.householdId);
    const parsedTransactionId = transactionIdSchema.safeParse(request.params.transactionId);

    if (!parsedHouseholdId.success || !parsedTransactionId.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
      });
      return;
    }

    const parsedPayload = simulateBillPaymentSchema.safeParse(request.body);

    if (!parsedPayload.success) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
      });
      return;
    }

    try {
      const result = await service.execute({
        householdId: parsedHouseholdId.data,
        requesterId: request.auth.userId,
        transactionId: parsedTransactionId.data,
        identificationField: parsedPayload.data.identificationField,
      });

      response.status(200).json({
        data: {
          transaction: result.transaction,
          simulation: result.simulation,
          amountMatchesTransaction: result.amountMatchesTransaction,
        },
      });
    } catch (error: unknown) {
      if (error instanceof TransactionNotFoundError) {
        response.status(404).json({
          error: { code: 'TRANSACTION_NOT_FOUND', message: error.message },
        });
        return;
      }

      if (error instanceof TransactionAlreadyPaidError) {
        response.status(409).json({
          error: { code: 'TRANSACTION_ALREADY_PAID', message: error.message },
        });
        return;
      }

      if (error instanceof AsaasClientError) {
        const { status, body } = toProviderErrorPayload(error.code);
        response.status(status).json(body);
        return;
      }

      next(error);
    }
  };
}
