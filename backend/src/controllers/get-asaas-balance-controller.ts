import type { RequestHandler } from 'express';
import { z } from 'zod';

import { AsaasClientError } from '../integrations/asaas/asaas-client.error.js';
import type { AsaasClientErrorCode } from '../integrations/asaas/asaas-client.error.js';
import { UnauthorizedError } from '../errors/unauthorized-error.js';
import type { GetAsaasBalanceService } from '../services/get-asaas-balance-service.js';

const householdIdSchema = z.uuid();

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

export function getAsaasBalanceController(
  service: GetAsaasBalanceService | undefined,
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

    try {
      const balance = await service.execute(parsedHouseholdId.data, request.auth.userId);

      response.status(200).json({ data: balance });
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
