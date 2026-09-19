import { InvalidAsaasWebhookPayloadError } from '../errors/invalid-asaas-webhook-payload-error.js';
import {
  parseAsaasBillWebhookPayload,
  sanitizeAsaasBillWebhookPayload,
} from '../integrations/asaas/asaas-webhook-payload.js';
import type {
  AsaasWebhookRepository,
  AsaasWebhookResult,
} from '../repositories/asaas-webhook-repository.js';

export type ReceivedAtProvider = () => Date;

export class ProcessAsaasWebhookService {
  constructor(
    private readonly webhookRepository: AsaasWebhookRepository,
    private readonly receivedAtProvider: ReceivedAtProvider = () => new Date(),
  ) {}

  async execute(rawBody: unknown): Promise<AsaasWebhookResult> {
    const parsed = parseAsaasBillWebhookPayload(rawBody);

    if (parsed === null) {
      throw new InvalidAsaasWebhookPayloadError();
    }

    const receivedAt = this.receivedAtProvider();

    return this.webhookRepository.recordAndApply({
      providerEventId: parsed.id,
      eventType: parsed.event,
      providerResourceId: parsed.bill.id,
      externalReference: parsed.bill.externalReference,
      // paid_at is the instant HSS received a trustworthy payment confirmation from Asaas — not
      // the instant the payment actually cleared at the bank. bill.paymentDate is a calendar
      // date with no time-of-day (e.g. "2026-09-18"): deriving a Date from it would always mean
      // fabricating a time (midnight UTC, noon UTC — equally invented), which the Transaction
      // CHECK constraint on paid_at does not require and callers should never mistake for a real
      // settlement timestamp. Asaas's webhook payload has no field carrying a real payment
      // timestamp, so receivedAt is the only trustworthy instant available; bill.paymentDate is
      // still preserved verbatim in the sanitized payload below for audit. If Asaas's
      // documentation is ever found to expose a real payment timestamp field, that field — not
      // this fallback — should become the paid_at source, with the change justified here.
      paidAt: receivedAt,
      failureReason:
        parsed.event === 'BILL_FAILED'
          ? `Asaas reported BILL_FAILED via webhook (event ${parsed.id})`
          : null,
      sanitizedPayload: sanitizeAsaasBillWebhookPayload(parsed),
    });
  }
}
