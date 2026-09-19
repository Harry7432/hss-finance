// Pague Contas webhook payload (POST /api/webhooks/asaas). Documented events: BILL_CREATED,
// BILL_PENDING, BILL_BANK_PROCESSING, BILL_PAID, BILL_CANCELLED, BILL_FAILED, BILL_REFUNDED.
// Delivery is at-least-once and Asaas may add new fields (or event types) over time, so this
// parser only requires the handful of fields the reconciliation flow actually depends on and
// tolerates everything else being missing, null, or of an unexpected shape.
export interface AsaasBillWebhookPayload {
  // The event's own id — the idempotency key (NOT the bill id).
  id: string;
  event: string;
  bill: {
    id: string;
    status: string;
    value: number | null;
    dueDate: string | null;
    scheduleDate: string | null;
    paymentDate: string | null;
    externalReference: string | null;
    discount: number | null;
    interest: number | null;
    fine: number | null;
    fee: number | null;
    canBeCancelled: boolean | null;
    failReasons: unknown;
  };
}

const ASAAS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalNullableFiniteNumber(value: unknown): value is number | null | undefined {
  return (
    value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value))
  );
}

function isOptionalNullableBoolean(value: unknown): value is boolean | null | undefined {
  return value === undefined || value === null || typeof value === 'boolean';
}

function toNullableString(value: unknown): string | null {
  return isOptionalNullableString(value) ? (value ?? null) : null;
}

function toNullableFiniteNumber(value: unknown): number | null {
  return isOptionalNullableFiniteNumber(value) ? (value ?? null) : null;
}

function toNullableBoolean(value: unknown): boolean | null {
  return isOptionalNullableBoolean(value) ? (value ?? null) : null;
}

// Only the two fields we cannot proceed without (bill.id and bill.status) are required. Every
// other bill field is treated as optional/nullable/tolerant-of-wrong-type, since a malformed
// or absent value there should never make the whole webhook unparseable — see item 17 (unknown
// payload) in the Slice F spec.
function isRawBillObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;

  return typeof record.id === 'string' && record.id.length > 0 && typeof record.status === 'string';
}

// Parses the untrusted webhook body into a well-typed payload, or returns null when the
// minimum required shape (event id, event type, bill.id, bill.status) is missing — that alone
// means the request cannot be persisted (nothing to key idempotency on) and is rejected with a
// 400, without ever reaching AsaasWebhookRepository.
export function parseAsaasBillWebhookPayload(body: unknown): AsaasBillWebhookPayload | null {
  if (body === null || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;

  if (typeof record.id !== 'string' || record.id.length === 0) return null;
  if (typeof record.event !== 'string' || record.event.length === 0) return null;
  if (!isRawBillObject(record.bill)) return null;

  const bill = record.bill;
  const paymentDate = toNullableString(bill.paymentDate);

  return {
    id: record.id,
    event: record.event,
    bill: {
      id: bill.id as string,
      status: bill.status as string,
      value: toNullableFiniteNumber(bill.value),
      dueDate: toNullableString(bill.dueDate),
      scheduleDate: toNullableString(bill.scheduleDate),
      paymentDate:
        paymentDate !== null && ASAAS_DATE_PATTERN.test(paymentDate) ? paymentDate : null,
      externalReference: toNullableString(bill.externalReference),
      discount: toNullableFiniteNumber(bill.discount),
      interest: toNullableFiniteNumber(bill.interest),
      fine: toNullableFiniteNumber(bill.fine),
      fee: toNullableFiniteNumber(bill.fee),
      canBeCancelled: toNullableBoolean(bill.canBeCancelled),
      failReasons: bill.failReasons ?? null,
    },
  };
}

// Persists only what is useful for audit/reprocessing — never the raw body. Deliberately
// excludes bill.identificationField (the bank barcode — we already have it from the original
// request; no need to duplicate it here), description, companyName, and transactionReceiptUrl
// (no reconciliation value, unnecessary PII-adjacent surface).
export function sanitizeAsaasBillWebhookPayload(
  payload: AsaasBillWebhookPayload,
): Record<string, unknown> {
  return {
    eventId: payload.id,
    event: payload.event,
    bill: {
      id: payload.bill.id,
      status: payload.bill.status,
      value: payload.bill.value,
      dueDate: payload.bill.dueDate,
      scheduleDate: payload.bill.scheduleDate,
      paymentDate: payload.bill.paymentDate,
      externalReference: payload.bill.externalReference,
      discount: payload.bill.discount,
      interest: payload.bill.interest,
      fine: payload.bill.fine,
      fee: payload.bill.fee,
      canBeCancelled: payload.bill.canBeCancelled,
      failReasons: payload.bill.failReasons,
    },
  };
}
