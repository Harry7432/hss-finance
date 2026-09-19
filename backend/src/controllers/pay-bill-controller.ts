import type { RequestHandler } from 'express';
import { z } from 'zod';

import { AsaasClientError } from '../integrations/asaas/asaas-client.error.js';
import type { AsaasClientErrorCode } from '../integrations/asaas/asaas-client.error.js';
import { InvalidPaymentAmountError } from '../errors/invalid-payment-amount-error.js';
import { PaymentAttemptAlreadyActiveError } from '../errors/payment-attempt-already-active-error.js';
import { TransactionAlreadyPaidError } from '../errors/transaction-already-paid-error.js';
import { TransactionNotFoundError } from '../errors/transaction-not-found-error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { PayBillService } from '../services/pay-bill-service.js';

const householdIdSchema = z.uuid();
const transactionIdSchema = z.uuid();

const payBillSchema = z.strictObject({
  identificationField: z.string().trim().min(1),
});

function toPayBillErrorPayload(code: AsaasClientErrorCode): {
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

  if (code === 'authentication') {
    return {
      status: 502,
      body: {
        error: {
          code: 'PROVIDER_ERROR',
          message: 'The payment provider rejected the request',
        },
      },
    };
  }

  // rate_limit (429), unavailable (network/timeout/5xx) and unknown (unparsable 2xx body): the
  // outcome is uncertain, not a confirmed rejection — the client must not retry automatically.
  // Asaas does not document that a 429 on a mutating endpoint like POST /bill is guaranteed to
  // precede any processing, so rate_limit gets the same treatment as a timeout here.
  return {
    status: 503,
    body: {
      error: {
        code: 'PROVIDER_RESPONSE_UNCERTAIN',
        message:
          'The payment provider did not confirm the outcome of this request. Do not retry automatically; this requires manual verification.',
      },
    },
  };
}

export function payBillController(service: PayBillService | undefined): RequestHandler {
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

    const parsedPayload = payBillSchema.safeParse(request.body);

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

      response.status(200).json({ data: result });
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

      if (error instanceof PaymentAttemptAlreadyActiveError) {
        response.status(409).json({
          error: { code: 'PAYMENT_ATTEMPT_ALREADY_ACTIVE', message: error.message },
        });
        return;
      }

      if (error instanceof InvalidPaymentAmountError) {
        response.status(409).json({
          error: { code: 'TRANSACTION_AMOUNT_CHANGED', message: error.message },
        });
        return;
      }

      if (error instanceof AsaasClientError) {
        const { status, body } = toPayBillErrorPayload(error.code);
        response.status(status).json(body);
        return;
      }

      next(error);
    }
  };
}
