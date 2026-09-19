import { decideAsaasBillWebhookAction } from '../src/integrations/asaas/asaas-webhook-state-machine.js';

describe('decideAsaasBillWebhookAction', () => {
  it('defers when no PaymentAttempt could be correlated, regardless of event type', () => {
    const eventTypes = [
      'BILL_CREATED',
      'BILL_PENDING',
      'BILL_BANK_PROCESSING',
      'BILL_PAID',
      'BILL_CANCELLED',
      'BILL_FAILED',
      'BILL_REFUNDED',
      'SOMETHING_UNKNOWN',
    ];

    for (const eventType of eventTypes) {
      expect(decideAsaasBillWebhookAction(eventType, null)).toEqual({ type: 'defer' });
    }
  });

  describe('informational events (BILL_CREATED / BILL_PENDING / BILL_BANK_PROCESSING)', () => {
    it.each(['BILL_CREATED', 'BILL_PENDING', 'BILL_BANK_PROCESSING'])(
      '%s never mutates the attempt while it is in flight',
      (eventType) => {
        expect(decideAsaasBillWebhookAction(eventType, 'processing')).toEqual({ type: 'none' });
        expect(decideAsaasBillWebhookAction(eventType, 'uncertain')).toEqual({ type: 'none' });
        expect(decideAsaasBillWebhookAction(eventType, 'requested')).toEqual({ type: 'none' });
      },
    );

    it.each(['BILL_CREATED', 'BILL_PENDING', 'BILL_BANK_PROCESSING'])(
      '%s is a safe no-op even after the attempt already reached a terminal state',
      (eventType) => {
        expect(decideAsaasBillWebhookAction(eventType, 'confirmed')).toEqual({ type: 'none' });
        expect(decideAsaasBillWebhookAction(eventType, 'failed')).toEqual({ type: 'none' });
        expect(decideAsaasBillWebhookAction(eventType, 'cancelled')).toEqual({ type: 'none' });
      },
    );
  });

  describe('BILL_PAID', () => {
    it.each(['processing', 'uncertain'] as const)('confirms from %s', (status) => {
      expect(decideAsaasBillWebhookAction('BILL_PAID', status)).toEqual({ type: 'confirm' });
    });

    it('is idempotent once already confirmed', () => {
      expect(decideAsaasBillWebhookAction('BILL_PAID', 'confirmed')).toEqual({
        type: 'idempotent_noop',
      });
    });

    it.each(['requested', 'failed', 'cancelled'] as const)(
      'defers instead of confirming from %s (fail-closed, no automatic assumption)',
      (status) => {
        expect(decideAsaasBillWebhookAction('BILL_PAID', status)).toEqual({ type: 'defer' });
      },
    );
  });

  describe('BILL_CANCELLED', () => {
    it.each(['processing', 'uncertain'] as const)('cancels from %s', (status) => {
      expect(decideAsaasBillWebhookAction('BILL_CANCELLED', status)).toEqual({ type: 'cancel' });
    });

    it('is idempotent once already cancelled', () => {
      expect(decideAsaasBillWebhookAction('BILL_CANCELLED', 'cancelled')).toEqual({
        type: 'idempotent_noop',
      });
    });

    it.each(['requested', 'confirmed', 'failed'] as const)(
      'defers instead of cancelling from %s (never regresses a confirmed/terminal attempt)',
      (status) => {
        expect(decideAsaasBillWebhookAction('BILL_CANCELLED', status)).toEqual({ type: 'defer' });
      },
    );
  });

  describe('BILL_FAILED', () => {
    it.each(['processing', 'uncertain'] as const)('fails from %s', (status) => {
      expect(decideAsaasBillWebhookAction('BILL_FAILED', status)).toEqual({ type: 'fail' });
    });

    it('is idempotent once already failed', () => {
      expect(decideAsaasBillWebhookAction('BILL_FAILED', 'failed')).toEqual({
        type: 'idempotent_noop',
      });
    });

    it.each(['requested', 'confirmed', 'cancelled'] as const)(
      'defers instead of failing from %s (never regresses a confirmed/terminal attempt)',
      (status) => {
        expect(decideAsaasBillWebhookAction('BILL_FAILED', status)).toEqual({ type: 'defer' });
      },
    );
  });

  describe('BILL_REFUNDED', () => {
    it.each(['requested', 'processing', 'uncertain', 'confirmed', 'failed', 'cancelled'] as const)(
      'always defers from %s — out of scope for this slice by explicit decision',
      (status) => {
        expect(decideAsaasBillWebhookAction('BILL_REFUNDED', status)).toEqual({ type: 'defer' });
      },
    );
  });

  describe('unrecognized/future event types', () => {
    it('defers rather than guessing at an unknown event type', () => {
      expect(decideAsaasBillWebhookAction('BILL_SOMETHING_NEW', 'processing')).toEqual({
        type: 'defer',
      });
    });
  });
});
