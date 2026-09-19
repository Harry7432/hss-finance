import { InvalidAsaasWebhookPayloadError } from '../src/errors/invalid-asaas-webhook-payload-error.js';
import type {
  AsaasWebhookRepository,
  AsaasWebhookResult,
  RecordAsaasWebhookEventData,
} from '../src/repositories/asaas-webhook-repository.js';
import { ProcessAsaasWebhookService } from '../src/services/process-asaas-webhook-service.js';

class FakeAsaasWebhookRepository implements AsaasWebhookRepository {
  calls: RecordAsaasWebhookEventData[] = [];

  constructor(
    private readonly result: AsaasWebhookResult = {
      outcome: 'confirmed',
      externalPaymentEventId: 'evt-row-1',
      paymentAttemptId: 'attempt-1',
    },
  ) {}

  async recordAndApply(data: RecordAsaasWebhookEventData): Promise<AsaasWebhookResult> {
    this.calls.push(data);
    return this.result;
  }
}

function rawPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt_000001',
    event: 'BILL_PAID',
    bill: {
      id: 'bill_000001',
      status: 'PAID',
      value: 200,
      dueDate: '2026-09-20',
      scheduleDate: '2026-09-18',
      paymentDate: '2026-09-18',
      identificationField: '03399.77779 29900.000000 04751.101017 1 81510000002990',
      externalReference: 'attempt-1',
      ...overrides,
    },
  };
}

describe('ProcessAsaasWebhookService', () => {
  it('parses the payload and delegates to the repository with paidAt = receivedAt, ignoring bill.paymentDate', async () => {
    const repository = new FakeAsaasWebhookRepository();
    const receivedAt = new Date('2026-09-19T03:00:00.000Z');
    const service = new ProcessAsaasWebhookService(repository, () => receivedAt);

    // bill.paymentDate is '2026-09-18' in rawPayload() — must never leak into paidAt (see
    // process-asaas-webhook-service.ts: bill.paymentDate has no time-of-day, so it is preserved
    // only in the sanitized payload for audit, never used to fabricate paid_at).
    await service.execute(rawPayload());

    expect(repository.calls).toEqual([
      {
        providerEventId: 'evt_000001',
        eventType: 'BILL_PAID',
        providerResourceId: 'bill_000001',
        externalReference: 'attempt-1',
        paidAt: receivedAt,
        failureReason: null,
        sanitizedPayload: expect.any(Object),
      },
    ]);
  });

  it('still preserves bill.paymentDate verbatim in the sanitized payload for audit, even though paidAt ignores it', async () => {
    const repository = new FakeAsaasWebhookRepository();
    const service = new ProcessAsaasWebhookService(repository);

    await service.execute(rawPayload());

    const sanitized = repository.calls[0]?.sanitizedPayload as { bill: { paymentDate: string } };
    expect(sanitized.bill.paymentDate).toBe('2026-09-18');
  });

  it('never forwards identificationField in the sanitized payload', async () => {
    const repository = new FakeAsaasWebhookRepository();
    const service = new ProcessAsaasWebhookService(repository);

    await service.execute(rawPayload());

    expect(JSON.stringify(repository.calls[0]?.sanitizedPayload)).not.toContain('81510000002990');
  });

  it('builds a failureReason including the event id only for BILL_FAILED', async () => {
    const repository = new FakeAsaasWebhookRepository();
    const service = new ProcessAsaasWebhookService(repository);

    await service.execute(rawPayload()); // event: BILL_PAID
    await service.execute({
      id: 'evt_000002',
      event: 'BILL_FAILED',
      bill: { id: 'bill_000002', status: 'FAILED' },
    });

    expect(repository.calls[0]?.failureReason).toBeNull();
    expect(repository.calls[1]?.failureReason).toContain('evt_000002');
  });

  it('uses receivedAt as paidAt even when paymentDate is entirely absent from the payload', async () => {
    const repository = new FakeAsaasWebhookRepository();
    const receivedAt = new Date('2026-09-19T03:00:00.000Z');
    const service = new ProcessAsaasWebhookService(repository, () => receivedAt);

    await service.execute({
      id: 'evt_000003',
      event: 'BILL_PAID',
      bill: { id: 'bill_000003', status: 'PAID' },
    });

    expect(repository.calls[0]?.paidAt).toBe(receivedAt);
  });

  it('throws InvalidAsaasWebhookPayloadError for an unparsable body without calling the repository', async () => {
    const repository = new FakeAsaasWebhookRepository();
    const service = new ProcessAsaasWebhookService(repository);

    await expect(service.execute({ not: 'a valid payload' })).rejects.toBeInstanceOf(
      InvalidAsaasWebhookPayloadError,
    );
    expect(repository.calls).toHaveLength(0);
  });

  it('returns the repository result unchanged', async () => {
    const result: AsaasWebhookResult = {
      outcome: 'duplicate',
      externalPaymentEventId: 'evt-row-9',
      paymentAttemptId: null,
    };
    const repository = new FakeAsaasWebhookRepository(result);
    const service = new ProcessAsaasWebhookService(repository);

    await expect(service.execute(rawPayload())).resolves.toEqual(result);
  });
});
