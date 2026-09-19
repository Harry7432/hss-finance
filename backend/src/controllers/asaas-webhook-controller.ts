import { timingSafeEqual } from 'node:crypto';

import type { RequestHandler } from 'express';

import { InvalidAsaasWebhookPayloadError } from '../errors/invalid-asaas-webhook-payload-error.js';
import type { ProcessAsaasWebhookService } from '../services/process-asaas-webhook-service.js';

const WEBHOOK_TOKEN_HEADER = 'asaas-access-token';

// Constant-time comparison so a mismatched token cannot be brute-forced via response timing.
// A length mismatch is checked first and short-circuits — this leaks only the length of the
// caller's guess, never anything about the secret's content, and matches how Node's own
// timingSafeEqual requires equal-length buffers.
function isValidWebhookToken(provided: string | undefined, expected: string): boolean {
  if (provided === undefined) return false;

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function asaasWebhookController(
  webhookToken: string | undefined,
  service: ProcessAsaasWebhookService | undefined,
): RequestHandler {
  return async (request, response, next) => {
    // Fails closed: an unconfigured webhook token must never be treated as "no auth required".
    if (webhookToken === undefined || !service) {
      response.status(503).json({
        error: {
          code: 'WEBHOOK_NOT_CONFIGURED',
          message: 'The Asaas webhook is not configured',
        },
      });
      return;
    }

    // Never log this header, and never include it (or the expected value) in any response.
    const providedToken = request.header(WEBHOOK_TOKEN_HEADER);

    if (!isValidWebhookToken(providedToken, webhookToken)) {
      response.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid webhook token' },
      });
      return;
    }

    try {
      await service.execute(request.body);
    } catch (error: unknown) {
      if (error instanceof InvalidAsaasWebhookPayloadError) {
        response.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid webhook payload' },
        });
        return;
      }

      // A genuine infrastructure failure (e.g. the database is unreachable) must not be
      // answered with 200 — Asaas's at-least-once retry model exists precisely so a real
      // failure here gets redelivered instead of silently lost.
      next(error);
      return;
    }

    // Deliberately minimal: no internal identifiers, no event details, and always 200 once the
    // event has been durably recorded — including for a duplicate delivery of an event already
    // fully processed (see AsaasWebhookRepository), which must never be reprocessed but must
    // still ack cleanly. A duplicate delivery of a still-pending event is reprocessed instead,
    // but the response shape is identical either way.
    response.status(200).json({ received: true });
  };
}
