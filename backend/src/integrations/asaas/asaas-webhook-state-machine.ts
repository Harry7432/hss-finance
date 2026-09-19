import type { PaymentAttemptStatus } from '../../database/entities/payment-attempt.entity.js';

export type AsaasBillWebhookAction =
  // BILL_CREATED / BILL_PENDING / BILL_BANK_PROCESSING while the attempt is still in flight:
  // purely informational, no PaymentAttempt/Transaction mutation.
  | { type: 'none' }
  // BILL_PAID with the attempt in 'processing' or 'uncertain': the only case that confirms the
  // attempt and marks the Transaction paid, atomically (see AsaasWebhookRepository).
  | { type: 'confirm' }
  // BILL_CANCELLED with the attempt in 'processing' or 'uncertain'.
  | { type: 'cancel' }
  // BILL_FAILED with the attempt in 'processing' or 'uncertain'.
  | { type: 'fail' }
  // The event's target state is already the attempt's current state (e.g. a second BILL_PAID
  // after the first already confirmed it). Recorded as fully handled; no write is repeated.
  | { type: 'idempotent_noop' }
  // Fail-closed: no correlation found, event type is unrecognized/BILL_REFUNDED, or the
  // transition would regress a terminal/unexpected state (e.g. BILL_PAID after 'failed'). Never
  // applied automatically — left for manual reconciliation (see ExternalPaymentEvent.processedAt).
  | { type: 'defer' };

const IN_FLIGHT_STATUSES: readonly PaymentAttemptStatus[] = ['processing', 'uncertain'];

// currentAttemptStatus is null when no PaymentAttempt could be correlated to this event at all
// (see AsaasWebhookRepository's correlation strategy: provider_resource_id, then
// externalReference). This function is pure and DB-free specifically so the decision logic can
// be unit-tested without a database; AsaasWebhookRepository is the only caller, and it always
// invokes this from inside the same locked transaction that applies the resulting action.
export function decideAsaasBillWebhookAction(
  eventType: string,
  currentAttemptStatus: PaymentAttemptStatus | null,
): AsaasBillWebhookAction {
  if (currentAttemptStatus === null) {
    return { type: 'defer' };
  }

  switch (eventType) {
    case 'BILL_CREATED':
    case 'BILL_PENDING':
    case 'BILL_BANK_PROCESSING':
      return { type: 'none' };

    case 'BILL_PAID':
      if (currentAttemptStatus === 'confirmed') return { type: 'idempotent_noop' };
      if (IN_FLIGHT_STATUSES.includes(currentAttemptStatus)) return { type: 'confirm' };
      // 'requested' (Asaas claims payment before our own write ever reached 'processing') and
      // 'failed'/'cancelled' (Asaas reports paid after we already recorded a terminal
      // rejection) are both genuine anomalies — never assumed away automatically.
      return { type: 'defer' };

    case 'BILL_CANCELLED':
      if (currentAttemptStatus === 'cancelled') return { type: 'idempotent_noop' };
      if (IN_FLIGHT_STATUSES.includes(currentAttemptStatus)) return { type: 'cancel' };
      return { type: 'defer' };

    case 'BILL_FAILED':
      if (currentAttemptStatus === 'failed') return { type: 'idempotent_noop' };
      if (IN_FLIGHT_STATUSES.includes(currentAttemptStatus)) return { type: 'fail' };
      return { type: 'defer' };

    // BILL_REFUNDED: the Transaction may already be 'paid' by the time this arrives. Inventing
    // an automatic rule here (e.g. reverting to pending) is explicitly out of scope for this
    // slice — always deferred for manual reconciliation, regardless of correlation.
    case 'BILL_REFUNDED':
      return { type: 'defer' };

    // Unrecognized/future event type: Asaas documents that new fields (and, by extension,
    // event types) may be added. Persisted for visibility, never acted on automatically.
    default:
      return { type: 'defer' };
  }
}
