import {
  parseAsaasBillWebhookPayload,
  sanitizeAsaasBillWebhookPayload,
} from '../src/integrations/asaas/asaas-webhook-payload.js';

function rawPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt_000001',
    event: 'BILL_PAID',
    dateCreated: '2026-09-18 12:00:00',
    bill: {
      object: 'bill',
      id: 'bill_000001',
      status: 'PAID',
      value: 200,
      discount: 0,
      interest: 0,
      fine: 0,
      identificationField: '03399.77779 29900.000000 04751.101017 1 81510000002990',
      dueDate: '2026-09-20',
      scheduleDate: '2026-09-18',
      paymentDate: '2026-09-18',
      fee: 1.9,
      description: 'Conta de luz',
      companyName: 'Acme Energia',
      transactionReceiptUrl: 'https://sandbox.asaas.com/receipt/abc',
      canBeCancelled: false,
      externalReference: 'attempt-1',
      failReasons: null,
    },
    ...overrides,
  };
}

describe('parseAsaasBillWebhookPayload', () => {
  it('parses a well-formed payload', () => {
    const parsed = parseAsaasBillWebhookPayload(rawPayload());

    expect(parsed).toEqual({
      id: 'evt_000001',
      event: 'BILL_PAID',
      bill: {
        id: 'bill_000001',
        status: 'PAID',
        value: 200,
        dueDate: '2026-09-20',
        scheduleDate: '2026-09-18',
        paymentDate: '2026-09-18',
        externalReference: 'attempt-1',
        discount: 0,
        interest: 0,
        fine: 0,
        fee: 1.9,
        canBeCancelled: false,
        failReasons: null,
      },
    });
  });

  it('tolerates unknown/extra top-level and bill fields (documented future fields)', () => {
    const parsed = parseAsaasBillWebhookPayload(
      rawPayload({ account: { id: 'acc_1', ownerId: 'owner_1' }, somethingNew: true }),
    );

    expect(parsed?.id).toBe('evt_000001');
  });

  it('tolerates a missing externalReference', () => {
    const payload = rawPayload();
    const bill = payload.bill as Record<string, unknown>;
    delete bill.externalReference;

    const parsed = parseAsaasBillWebhookPayload(payload);

    expect(parsed?.bill.externalReference).toBeNull();
  });

  it('tolerates a missing or non-date-shaped paymentDate, normalizing to null', () => {
    const missing = rawPayload();
    const missingBill = missing.bill as Record<string, unknown>;
    delete missingBill.paymentDate;
    expect(parseAsaasBillWebhookPayload(missing)?.bill.paymentDate).toBeNull();

    const malformed = rawPayload({
      bill: { ...(rawPayload().bill as Record<string, unknown>), paymentDate: '18/09/2026' },
    });
    expect(parseAsaasBillWebhookPayload(malformed)?.bill.paymentDate).toBeNull();
  });

  // Full calendar validity (e.g. rejecting 2026-02-30) is deliberately NOT the parser's job —
  // it only normalizes shape. resolvePaidAt (process-asaas-webhook-service) does the calendar
  // check at the point where paymentDate is actually turned into a paid_at Date; raw_payload
  // keeps whatever Asaas actually sent, calendar-valid or not, for faithful audit.
  it('passes through a format-shaped but calendar-invalid paymentDate unchanged', () => {
    const impossibleDate = rawPayload({
      bill: { ...(rawPayload().bill as Record<string, unknown>), paymentDate: '2026-02-30' },
    });

    expect(parseAsaasBillWebhookPayload(impossibleDate)?.bill.paymentDate).toBe('2026-02-30');
  });

  it('rejects a payload missing the top-level event id', () => {
    const payload = rawPayload();
    delete payload.id;

    expect(parseAsaasBillWebhookPayload(payload)).toBeNull();
  });

  it('rejects a payload missing the event type', () => {
    const payload = rawPayload();
    delete payload.event;

    expect(parseAsaasBillWebhookPayload(payload)).toBeNull();
  });

  it('rejects a payload missing bill.id', () => {
    const payload = rawPayload();
    const bill = payload.bill as Record<string, unknown>;
    delete bill.id;

    expect(parseAsaasBillWebhookPayload(payload)).toBeNull();
  });

  it('rejects a payload missing bill.status', () => {
    const payload = rawPayload();
    const bill = payload.bill as Record<string, unknown>;
    delete bill.status;

    expect(parseAsaasBillWebhookPayload(payload)).toBeNull();
  });

  it('rejects a payload missing the bill object entirely', () => {
    const payload = rawPayload();
    delete payload.bill;

    expect(parseAsaasBillWebhookPayload(payload)).toBeNull();
  });

  it.each([null, undefined, 'a string', 42, []])('rejects a non-object body: %p', (body) => {
    expect(parseAsaasBillWebhookPayload(body)).toBeNull();
  });
});

describe('sanitizeAsaasBillWebhookPayload', () => {
  it('never includes identificationField, description, companyName, or transactionReceiptUrl', () => {
    const parsed = parseAsaasBillWebhookPayload(rawPayload());
    expect(parsed).not.toBeNull();

    const sanitized = JSON.stringify(sanitizeAsaasBillWebhookPayload(parsed!));

    expect(sanitized).not.toContain('81510000002990');
    expect(sanitized).not.toContain('identificationField');
    expect(sanitized).not.toContain('Conta de luz');
    expect(sanitized).not.toContain('Acme Energia');
    expect(sanitized).not.toContain('transactionReceiptUrl');
  });

  it('preserves the fields needed for audit and reconciliation', () => {
    const parsed = parseAsaasBillWebhookPayload(rawPayload());
    const sanitized = sanitizeAsaasBillWebhookPayload(parsed!);

    expect(sanitized).toEqual({
      eventId: 'evt_000001',
      event: 'BILL_PAID',
      bill: {
        id: 'bill_000001',
        status: 'PAID',
        value: 200,
        dueDate: '2026-09-20',
        scheduleDate: '2026-09-18',
        paymentDate: '2026-09-18',
        externalReference: 'attempt-1',
        discount: 0,
        interest: 0,
        fine: 0,
        fee: 1.9,
        canBeCancelled: false,
        failReasons: null,
      },
    });
  });
});
