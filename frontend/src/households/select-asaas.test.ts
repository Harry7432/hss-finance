import { describe, expect, it } from 'vitest';

import {
  canRetryAfterPaymentAttempt,
  isTerminalPaymentAttemptStatus,
  PAYMENT_ATTEMPT_STATUS_LABEL,
} from './select-asaas';

describe('isTerminalPaymentAttemptStatus', () => {
  it('treats requested and processing as non-terminal', () => {
    expect(isTerminalPaymentAttemptStatus('requested')).toBe(false);
    expect(isTerminalPaymentAttemptStatus('processing')).toBe(false);
  });

  it('treats confirmed, failed, cancelled, and uncertain as terminal', () => {
    expect(isTerminalPaymentAttemptStatus('confirmed')).toBe(true);
    expect(isTerminalPaymentAttemptStatus('failed')).toBe(true);
    expect(isTerminalPaymentAttemptStatus('cancelled')).toBe(true);
    expect(isTerminalPaymentAttemptStatus('uncertain')).toBe(true);
  });
});

describe('canRetryAfterPaymentAttempt', () => {
  it('never allows a retry after an uncertain outcome', () => {
    expect(canRetryAfterPaymentAttempt('uncertain')).toBe(false);
  });

  it('allows a retry after failed or cancelled', () => {
    expect(canRetryAfterPaymentAttempt('failed')).toBe(true);
    expect(canRetryAfterPaymentAttempt('cancelled')).toBe(true);
  });

  it('does not offer a retry for confirmed, requested, or processing', () => {
    expect(canRetryAfterPaymentAttempt('confirmed')).toBe(false);
    expect(canRetryAfterPaymentAttempt('requested')).toBe(false);
    expect(canRetryAfterPaymentAttempt('processing')).toBe(false);
  });
});

describe('PAYMENT_ATTEMPT_STATUS_LABEL', () => {
  it('never calls an uncertain outcome "Pago" or similar', () => {
    for (const label of Object.values(PAYMENT_ATTEMPT_STATUS_LABEL)) {
      expect(label.toLowerCase()).not.toBe('pago');
    }
  });

  it('matches the friendly copy specified for the slice', () => {
    expect(PAYMENT_ATTEMPT_STATUS_LABEL.processing).toBe('Processamento iniciado');
    expect(PAYMENT_ATTEMPT_STATUS_LABEL.confirmed).toBe('Pagamento confirmado');
    expect(PAYMENT_ATTEMPT_STATUS_LABEL.failed).toBe('Pagamento não concluído');
    expect(PAYMENT_ATTEMPT_STATUS_LABEL.cancelled).toBe('Pagamento cancelado');
    expect(PAYMENT_ATTEMPT_STATUS_LABEL.uncertain).toBe(
      'Confirmação pendente — não tente novamente',
    );
  });
});
