import type { DataSource, EntityManager, QueryDeepPartialEntity } from 'typeorm';

import { ExternalPaymentEventEntity } from '../database/entities/external-payment-event.entity.js';
import { PaymentAttemptEntity } from '../database/entities/payment-attempt.entity.js';
import { TransactionEntity } from '../database/entities/transaction.entity.js';
import { decideAsaasBillWebhookAction } from '../integrations/asaas/asaas-webhook-state-machine.js';

export type AsaasWebhookOutcome =
  // provider_event_id already existed AND was already processed_at-stamped — the business rule
  // was already fully applied (or deliberately treated as a terminal no-op) by an earlier
  // delivery; nothing is re-executed. A redelivery of a still-*pending* (processed_at IS NULL)
  // event does NOT get this outcome — it is reprocessed and returns whatever outcome that
  // reprocessing produces (below). See recordAndApply.
  | 'duplicate'
  // Event processed (fresh or reprocessed), but no PaymentAttempt could be correlated to it.
  | 'no_correlation'
  // Event processed (fresh or reprocessed), correlated, purely informational
  // (BILL_CREATED/PENDING/BANK_PROCESSING).
  | 'no_action'
  | 'confirmed'
  | 'cancelled'
  | 'failed'
  // Event processed (fresh or reprocessed), correlated, but the attempt was already in the
  // event's target terminal state.
  | 'idempotent_noop'
  // Event processed (fresh or reprocessed), correlated, but the transition was rejected as
  // invalid/out-of-order, or the event is BILL_REFUNDED / unrecognized — still deferred
  // (processed_at stays NULL) for manual reconciliation or a future redelivery.
  | 'deferred_invalid_transition';

export interface RecordAsaasWebhookEventData {
  providerEventId: string;
  eventType: string;
  providerResourceId: string;
  externalReference: string | null;
  // Trusted paid-at instant to use only when this event results in a 'confirmed' outcome.
  // Resolution (bill.paymentDate vs. a documented fallback) happens in the caller — see
  // ProcessAsaasWebhookService.
  paidAt: Date;
  failureReason: string | null;
  sanitizedPayload: Record<string, unknown>;
}

export interface AsaasWebhookResult {
  outcome: AsaasWebhookOutcome;
  externalPaymentEventId: string;
  paymentAttemptId: string | null;
}

export interface AsaasWebhookRepository {
  recordAndApply(data: RecordAsaasWebhookEventData): Promise<AsaasWebhookResult>;
}

const OUTCOMES_CONSIDERED_HANDLED: readonly AsaasWebhookOutcome[] = [
  'no_action',
  'confirmed',
  'cancelled',
  'failed',
  'idempotent_noop',
];

export class TypeOrmAsaasWebhookRepository implements AsaasWebhookRepository {
  constructor(private readonly dataSource: DataSource) {}

  async recordAndApply(data: RecordAsaasWebhookEventData): Promise<AsaasWebhookResult> {
    return this.dataSource.transaction(async (manager) => {
      const insertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(ExternalPaymentEventEntity)
        .values({
          provider: 'asaas',
          providerEventId: data.providerEventId,
          eventType: data.eventType,
          providerResourceId: data.providerResourceId,
          paymentAttempt: null,
          // jsonb column: TypeORM's insert typings don't infer a plain Record here.
          rawPayload: data.sanitizedPayload,
          processedAt: null,
        } as QueryDeepPartialEntity<ExternalPaymentEventEntity>)
        // ON CONFLICT DO NOTHING (Postgres): unlike catching a unique-violation error, this
        // does not abort the transaction, so the duplicate check and the business logic below
        // can share one atomic transaction. See the class doc for why that matters.
        .orIgnore()
        .execute();

      const insertedId = insertResult.identifiers[0]?.id as string | undefined;

      if (insertedId !== undefined) {
        return this.processEvent(manager, insertedId, data);
      }

      // Conflict: this provider_event_id already exists. Lock the row before deciding what to
      // do with it — two concurrent redeliveries of the same event must not both decide
      // "reprocess" and race each other into applying the business rule twice.
      const lockedExisting = await manager.findOneOrFail(ExternalPaymentEventEntity, {
        select: { id: true, processedAt: true },
        where: { providerEventId: data.providerEventId },
        lock: { mode: 'pessimistic_write' },
      });

      if (lockedExisting.processedAt !== null) {
        // Already fully decided by an earlier delivery (including a deliberate no-op) — the
        // business rule must never run twice, so we stop here without touching
        // PaymentAttempt/Transaction again.
        const withAttempt = await manager.findOneOrFail(ExternalPaymentEventEntity, {
          select: { id: true, paymentAttempt: { id: true } },
          relations: { paymentAttempt: true },
          where: { id: lockedExisting.id },
        });

        return {
          outcome: 'duplicate',
          externalPaymentEventId: withAttempt.id,
          paymentAttemptId: withAttempt.paymentAttempt?.id ?? null,
        };
      }

      // processed_at IS NULL: this event was previously deferred (no correlation yet, or the
      // transition was fail-closed at the time). A redelivery is a legitimate opportunity to
      // reevaluate it against current state — idempotency means "never reapply an event already
      // processed", not "never look at a still-pending one again". See class doc.
      return this.processEvent(manager, lockedExisting.id, data);
    });
  }

  // Runs the correlate -> decide -> apply -> mark-processed sequence against one
  // ExternalPaymentEvent row, atomically. Shared by both the fresh-insert path and the
  // reprocess-a-still-pending-duplicate path in recordAndApply, so a redelivered deferred event
  // gets exactly the same handling (and the same atomicity guarantees) as a brand-new one.
  private async processEvent(
    manager: EntityManager,
    eventId: string,
    data: RecordAsaasWebhookEventData,
  ): Promise<AsaasWebhookResult> {
    const correlated = await this.correlateAndLock(manager, data);
    const action = decideAsaasBillWebhookAction(data.eventType, correlated?.attempt.status ?? null);

    let outcome: AsaasWebhookOutcome;

    if (correlated === null) {
      outcome = 'no_correlation';
    } else {
      const { attempt, transaction } = correlated;

      switch (action.type) {
        case 'none':
          outcome = 'no_action';
          break;
        case 'idempotent_noop':
          outcome = 'idempotent_noop';
          break;
        case 'confirm':
          outcome = await this.applyConfirm(manager, attempt, transaction, data.paidAt);
          break;
        case 'cancel':
          attempt.status = 'cancelled';
          await manager.getRepository(PaymentAttemptEntity).save(attempt);
          outcome = 'cancelled';
          break;
        case 'fail':
          attempt.status = 'failed';
          attempt.failureReason = data.failureReason ?? 'Asaas reported BILL_FAILED via webhook';
          await manager.getRepository(PaymentAttemptEntity).save(attempt);
          outcome = 'failed';
          break;
        case 'defer':
          outcome = 'deferred_invalid_transition';
          break;
      }
    }

    const attempt = correlated?.attempt ?? null;

    await manager.getRepository(ExternalPaymentEventEntity).update(
      { id: eventId },
      {
        paymentAttempt: attempt ? { id: attempt.id } : null,
        processedAt: OUTCOMES_CONSIDERED_HANDLED.includes(outcome) ? new Date() : null,
      },
    );

    return {
      outcome,
      externalPaymentEventId: eventId,
      paymentAttemptId: attempt?.id ?? null,
    };
  }

  // Locks are acquired Transaction-before-PaymentAttempt, in that fixed order, regardless of
  // which event type is being processed (even one that never touches the Transaction, like
  // BILL_CANCELLED). This matches the lock order TypeOrmPaymentAttemptRepository.
  // createPaymentAttempt already uses (it locks the Transaction row, then checks for an active
  // PaymentAttempt) — locking in the opposite order here (PaymentAttempt then Transaction, as
  // an earlier version of this method did) would let a webhook confirming attempt X race a
  // concurrent pay-bill request against the same Transaction into a Postgres deadlock.
  private async correlateAndLock(
    manager: EntityManager,
    data: RecordAsaasWebhookEventData,
  ): Promise<{ attempt: PaymentAttemptEntity; transaction: TransactionEntity } | null> {
    // Unlocked probe, only to learn which Transaction row to lock first.
    const candidate =
      (await manager.findOne(PaymentAttemptEntity, {
        select: { id: true, transaction: { id: true } },
        relations: { transaction: true },
        where: { providerResourceId: data.providerResourceId },
      })) ??
      (data.externalReference === null
        ? null
        : // Fallback: externalReference = PaymentAttempt.id (see PayBillService). This is what
          // lets an 'uncertain' attempt — whose provider_resource_id may still be null — be
          // reconciled by a BILL_PAID webhook even though the synchronous POST /bill response
          // was never persisted.
          await manager.findOne(PaymentAttemptEntity, {
            select: { id: true, transaction: { id: true } },
            relations: { transaction: true },
            where: { id: data.externalReference },
          }));

    if (candidate === null) {
      return null;
    }

    const transaction = await manager.findOne(TransactionEntity, {
      where: { id: candidate.transaction.id },
      lock: { mode: 'pessimistic_write', tables: ['transactions'] },
    });

    // Defensive: transaction_id is FK RESTRICT, so this should be unreachable.
    if (transaction === null) {
      return null;
    }

    // tables: ['payment_attempts'] restricts FOR UPDATE to this row only, matching the existing
    // convention in TypeOrmPaymentAttemptRepository — locking the joined transaction row too
    // would defeat the fixed lock order this method exists to guarantee.
    const attempt = await manager.findOneOrFail(PaymentAttemptEntity, {
      where: { id: candidate.id },
      lock: { mode: 'pessimistic_write', tables: ['payment_attempts'] },
    });

    return { attempt, transaction };
  }

  private async applyConfirm(
    manager: EntityManager,
    attempt: PaymentAttemptEntity,
    transaction: TransactionEntity,
    paidAt: Date,
  ): Promise<AsaasWebhookOutcome> {
    // Defensive: the Transaction should always still be 'pending' here (nothing else can pay it
    // while this attempt blocks new ones), but if it is somehow already 'paid', confirming the
    // attempt anyway would break the "confirmed implies Transaction paid by this attempt"
    // invariant. Deferred for manual review instead of silently diverging.
    if (transaction.status !== 'pending') {
      return 'deferred_invalid_transition';
    }

    attempt.status = 'confirmed';
    attempt.confirmedAt = new Date();
    transaction.status = 'paid';
    transaction.paidAt = paidAt;

    // Same manager/transaction as the locks above: both writes commit or roll back together.
    await manager.getRepository(PaymentAttemptEntity).save(attempt);
    await manager.getRepository(TransactionEntity).save(transaction);

    return 'confirmed';
  }
}
