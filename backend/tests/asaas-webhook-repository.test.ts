import { randomUUID } from 'node:crypto';

import { In } from 'typeorm';

import { appDataSource } from '../src/database/data-source.js';
import { ExternalPaymentEventEntity } from '../src/database/entities/external-payment-event.entity.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { HouseholdMemberEntity } from '../src/database/entities/household-member.entity.js';
import { PaymentAttemptEntity } from '../src/database/entities/payment-attempt.entity.js';
import type { PaymentAttemptStatus } from '../src/database/entities/payment-attempt.entity.js';
import { TransactionEntity } from '../src/database/entities/transaction.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import type {
  AsaasWebhookRepository,
  RecordAsaasWebhookEventData,
} from '../src/repositories/asaas-webhook-repository.js';
import { TypeOrmAsaasWebhookRepository } from '../src/repositories/asaas-webhook-repository.js';

const PAID_AT = new Date('2026-09-18T00:00:00.000Z');

describe('TypeOrmAsaasWebhookRepository (real PostgreSQL)', () => {
  let user: UserEntity;
  let household: HouseholdEntity;
  let repository: AsaasWebhookRepository;
  // Some scenarios correlate to no PaymentAttempt at all (orphan ExternalPaymentEvent rows), so
  // cleanup can't rely solely on walking from household -> transaction -> attempt -> event.
  // Every call made through `repository` here is tracked so afterEach can delete precisely
  // what this test created, regardless of correlation outcome.
  let recordedEventIds: string[];

  beforeAll(async () => {
    await appDataSource.initialize();
  });

  afterAll(async () => {
    await appDataSource.destroy();
  });

  beforeEach(async () => {
    recordedEventIds = [];
    const realRepository = new TypeOrmAsaasWebhookRepository(appDataSource);
    repository = {
      async recordAndApply(data) {
        const result = await realRepository.recordAndApply(data);
        recordedEventIds.push(result.externalPaymentEventId);
        return result;
      },
    };

    user = await appDataSource.manager.save(
      appDataSource.manager.create(UserEntity, {
        email: `asaas-webhook-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Webhook Test User',
      }),
    );

    household = await appDataSource.manager.save(
      appDataSource.manager.create(HouseholdEntity, {
        name: 'Webhook Test Household',
        currencyCode: 'BRL',
        createdBy: user,
      }),
    );

    await appDataSource.manager.save(
      appDataSource.manager.create(HouseholdMemberEntity, { household, user, role: 'owner' }),
    );
  });

  afterEach(async () => {
    // external_payment_events.payment_attempt_id is FK RESTRICT, so events must go first.
    if (recordedEventIds.length > 0) {
      await appDataSource.manager.delete(ExternalPaymentEventEntity, { id: In(recordedEventIds) });
    }

    const transactions = await appDataSource.manager.find(TransactionEntity, {
      select: { id: true },
      where: { household: { id: household.id } },
    });

    if (transactions.length > 0) {
      await appDataSource.manager.delete(PaymentAttemptEntity, {
        transaction: { id: In(transactions.map((transaction) => transaction.id)) },
      });
    }

    // Transaction rows are cascade-deleted with the household.
    await appDataSource.manager.delete(HouseholdEntity, { id: household.id });
    await appDataSource.manager.delete(UserEntity, { id: user.id });
  });

  async function createTransaction(
    overrides: Partial<TransactionEntity> = {},
  ): Promise<TransactionEntity> {
    return appDataSource.manager.save(
      appDataSource.manager.create(TransactionEntity, {
        household,
        category: null,
        createdBy: user,
        type: 'expense',
        amount: '200.00',
        transactionDate: '2026-09-18',
        dueDate: '2026-09-23',
        paidAt: null,
        status: 'pending',
        source: 'manual',
        externalId: null,
        description: null,
        originalDescription: null,
        recurringTransaction: null,
        recurringPeriod: null,
        expenseNature: null,
        ...overrides,
      }),
    );
  }

  async function createAttempt(
    transaction: TransactionEntity,
    overrides: Partial<PaymentAttemptEntity> = {},
  ): Promise<PaymentAttemptEntity> {
    return appDataSource.manager.save(
      appDataSource.manager.create(PaymentAttemptEntity, {
        transaction,
        initiatedBy: user,
        kind: 'bill',
        provider: 'asaas',
        providerResourceId: 'bill_000001',
        idempotencyKey: randomUUID(),
        status: 'processing',
        requestedAmount: '200.00',
        failureReason: null,
        confirmedAt: null,
        ...overrides,
      }),
    );
  }

  function eventData(
    overrides: Partial<RecordAsaasWebhookEventData> = {},
  ): RecordAsaasWebhookEventData {
    return {
      providerEventId: randomUUID(),
      eventType: 'BILL_PAID',
      providerResourceId: 'bill_000001',
      externalReference: null,
      paidAt: PAID_AT,
      failureReason: null,
      sanitizedPayload: { eventId: 'evt', event: 'BILL_PAID' },
      ...overrides,
    };
  }

  async function reloadAttempt(id: string): Promise<PaymentAttemptEntity> {
    return appDataSource.getRepository(PaymentAttemptEntity).findOneOrFail({ where: { id } });
  }

  async function reloadTransaction(id: string): Promise<TransactionEntity> {
    return appDataSource.getRepository(TransactionEntity).findOneOrFail({ where: { id } });
  }

  async function reloadEvent(id: string): Promise<ExternalPaymentEventEntity> {
    return appDataSource.getRepository(ExternalPaymentEventEntity).findOneOrFail({
      where: { id },
      relations: { paymentAttempt: true },
    });
  }

  describe('BILL_PAID — atomic confirmation', () => {
    it('confirms the attempt and marks the Transaction paid atomically, from processing', async () => {
      const transaction = await createTransaction();
      const attempt = await createAttempt(transaction, { status: 'processing' });

      const result = await repository.recordAndApply(
        eventData({ providerResourceId: 'bill_000001', paidAt: PAID_AT }),
      );

      expect(result.outcome).toBe('confirmed');
      expect(result.paymentAttemptId).toBe(attempt.id);

      const storedAttempt = await reloadAttempt(attempt.id);
      expect(storedAttempt.status).toBe('confirmed');
      expect(storedAttempt.confirmedAt).not.toBeNull();

      const storedTransaction = await reloadTransaction(transaction.id);
      expect(storedTransaction.status).toBe('paid');
      expect(storedTransaction.paidAt).toEqual(PAID_AT);

      const storedEvent = await reloadEvent(result.externalPaymentEventId);
      expect(storedEvent.processedAt).not.toBeNull();
    });

    it('confirms an uncertain attempt correlated only via externalReference (mandatory scenario)', async () => {
      const transaction = await createTransaction();
      // uncertain: provider_resource_id is null (the local write that would have set it never
      // committed), so correlation can only succeed via externalReference = PaymentAttempt.id.
      const attempt = await createAttempt(transaction, {
        status: 'uncertain',
        providerResourceId: null,
        failureReason: 'Asaas accepted the bill payment but the local write failed',
      });

      const result = await repository.recordAndApply(
        eventData({
          providerResourceId: 'bill_from_asaas_not_yet_known_locally',
          externalReference: attempt.id,
        }),
      );

      expect(result.outcome).toBe('confirmed');

      const storedAttempt = await reloadAttempt(attempt.id);
      expect(storedAttempt.status).toBe('confirmed');

      const storedTransaction = await reloadTransaction(transaction.id);
      expect(storedTransaction.status).toBe('paid');
    });

    it('is idempotent when BILL_PAID is (re)received after the attempt already confirmed', async () => {
      const transaction = await createTransaction();
      await createAttempt(transaction, { status: 'confirmed', confirmedAt: new Date() });
      await appDataSource.manager.update(
        TransactionEntity,
        { id: transaction.id },
        {
          status: 'paid',
          paidAt: PAID_AT,
        },
      );

      const result = await repository.recordAndApply(eventData({ providerEventId: randomUUID() }));

      expect(result.outcome).toBe('idempotent_noop');

      const storedTransaction = await reloadTransaction(transaction.id);
      expect(storedTransaction.paidAt).toEqual(PAID_AT);
    });

    it.each(['requested', 'failed', 'cancelled'] as const)(
      'defers BILL_PAID from %s without mutating attempt or Transaction (fail-closed)',
      async (status: PaymentAttemptStatus) => {
        const transaction = await createTransaction();
        const attempt = await createAttempt(transaction, { status });

        const result = await repository.recordAndApply(eventData());

        expect(result.outcome).toBe('deferred_invalid_transition');

        const storedAttempt = await reloadAttempt(attempt.id);
        expect(storedAttempt.status).toBe(status);

        const storedTransaction = await reloadTransaction(transaction.id);
        expect(storedTransaction.status).toBe('pending');

        const storedEvent = await reloadEvent(result.externalPaymentEventId);
        expect(storedEvent.processedAt).toBeNull();
      },
    );
  });

  describe('idempotency (at-least-once delivery)', () => {
    it('applies the business rule only once when the same event id is delivered twice', async () => {
      const transaction = await createTransaction();
      const attempt = await createAttempt(transaction, { status: 'processing' });
      const providerEventId = randomUUID();

      const first = await repository.recordAndApply(eventData({ providerEventId }));
      const second = await repository.recordAndApply(
        eventData({ providerEventId, paidAt: new Date('2099-01-01T00:00:00.000Z') }),
      );

      expect(first.outcome).toBe('confirmed');
      expect(second.outcome).toBe('duplicate');
      expect(second.externalPaymentEventId).toBe(first.externalPaymentEventId);

      const storedTransaction = await reloadTransaction(transaction.id);
      // paid_at must be the one from the FIRST delivery — the duplicate is never re-applied.
      expect(storedTransaction.paidAt).toEqual(PAID_AT);

      const events = await appDataSource
        .getRepository(ExternalPaymentEventEntity)
        .find({ where: { providerEventId } });
      expect(events).toHaveLength(1);

      const storedAttempt = await reloadAttempt(attempt.id);
      expect(storedAttempt.status).toBe('confirmed');
    });

    it('reprocesses (rather than just dedupes) a redelivery of an event still pending with the same unresolved state', async () => {
      const providerEventId = randomUUID();

      const first = await repository.recordAndApply(
        eventData({ providerEventId, providerResourceId: 'bill_never_seen' }),
      );
      const second = await repository.recordAndApply(
        eventData({ providerEventId, providerResourceId: 'bill_never_seen' }),
      );

      // Nothing about the correlation changed between deliveries, so reprocessing lands on the
      // same outcome — but it must genuinely be reprocessed, not short-circuited as 'duplicate'
      // (processed_at is still NULL; see AsaasWebhookRepository's deferred-event redelivery
      // handling — a duplicate is only ever a no-op once processed_at is set).
      expect(first.outcome).toBe('no_correlation');
      expect(second.outcome).toBe('no_correlation');
      expect(second.externalPaymentEventId).toBe(first.externalPaymentEventId);

      const events = await appDataSource
        .getRepository(ExternalPaymentEventEntity)
        .find({ where: { providerEventId } });
      expect(events).toHaveLength(1);
      expect(events[0]?.processedAt).toBeNull();
    });
  });

  describe('intermediate events (BILL_CREATED / BILL_PENDING / BILL_BANK_PROCESSING)', () => {
    it.each(['BILL_CREATED', 'BILL_PENDING', 'BILL_BANK_PROCESSING'])(
      '%s never marks the Transaction paid',
      async (eventType) => {
        const transaction = await createTransaction();
        const attempt = await createAttempt(transaction, { status: 'processing' });

        const result = await repository.recordAndApply(eventData({ eventType }));

        expect(result.outcome).toBe('no_action');

        const storedAttempt = await reloadAttempt(attempt.id);
        expect(storedAttempt.status).toBe('processing');

        const storedTransaction = await reloadTransaction(transaction.id);
        expect(storedTransaction.status).toBe('pending');
        expect(storedTransaction.paidAt).toBeNull();

        const storedEvent = await reloadEvent(result.externalPaymentEventId);
        expect(storedEvent.processedAt).not.toBeNull();
      },
    );
  });

  describe('BILL_FAILED / BILL_CANCELLED', () => {
    it('marks the attempt failed and leaves the Transaction pending', async () => {
      const transaction = await createTransaction();
      const attempt = await createAttempt(transaction, { status: 'processing' });

      const result = await repository.recordAndApply(
        eventData({ eventType: 'BILL_FAILED', failureReason: 'Asaas reported BILL_FAILED' }),
      );

      expect(result.outcome).toBe('failed');

      const storedAttempt = await reloadAttempt(attempt.id);
      expect(storedAttempt.status).toBe('failed');
      expect(storedAttempt.failureReason).toBe('Asaas reported BILL_FAILED');

      const storedTransaction = await reloadTransaction(transaction.id);
      expect(storedTransaction.status).toBe('pending');
    });

    it('marks the attempt cancelled and leaves the Transaction pending', async () => {
      const transaction = await createTransaction();
      const attempt = await createAttempt(transaction, { status: 'uncertain' });

      const result = await repository.recordAndApply(eventData({ eventType: 'BILL_CANCELLED' }));

      expect(result.outcome).toBe('cancelled');

      const storedAttempt = await reloadAttempt(attempt.id);
      expect(storedAttempt.status).toBe('cancelled');

      const storedTransaction = await reloadTransaction(transaction.id);
      expect(storedTransaction.status).toBe('pending');
    });

    it('never regresses a confirmed attempt back to cancelled/failed', async () => {
      const transaction = await createTransaction({ status: 'paid', paidAt: PAID_AT });
      const attempt = await createAttempt(transaction, {
        status: 'confirmed',
        confirmedAt: new Date(),
      });

      const cancelResult = await repository.recordAndApply(
        eventData({ eventType: 'BILL_CANCELLED' }),
      );
      const failResult = await repository.recordAndApply(
        eventData({ eventType: 'BILL_FAILED', providerEventId: randomUUID() }),
      );

      expect(cancelResult.outcome).toBe('deferred_invalid_transition');
      expect(failResult.outcome).toBe('deferred_invalid_transition');

      const storedAttempt = await reloadAttempt(attempt.id);
      expect(storedAttempt.status).toBe('confirmed');

      const storedTransaction = await reloadTransaction(transaction.id);
      expect(storedTransaction.status).toBe('paid');
    });
  });

  describe('BILL_REFUNDED', () => {
    it('never mutates business state, even when correlated, and defers for manual reconciliation', async () => {
      const transaction = await createTransaction({ status: 'paid', paidAt: PAID_AT });
      const attempt = await createAttempt(transaction, {
        status: 'confirmed',
        confirmedAt: new Date(),
      });

      const result = await repository.recordAndApply(eventData({ eventType: 'BILL_REFUNDED' }));

      expect(result.outcome).toBe('deferred_invalid_transition');

      const storedAttempt = await reloadAttempt(attempt.id);
      expect(storedAttempt.status).toBe('confirmed');

      const storedTransaction = await reloadTransaction(transaction.id);
      expect(storedTransaction.status).toBe('paid');

      const storedEvent = await reloadEvent(result.externalPaymentEventId);
      expect(storedEvent.processedAt).toBeNull();
    });
  });

  describe('correlation failures', () => {
    it('persists the event without touching any attempt when no correlation is found', async () => {
      const result = await repository.recordAndApply(
        eventData({ providerResourceId: 'bill_unknown_to_us', externalReference: null }),
      );

      expect(result.outcome).toBe('no_correlation');
      expect(result.paymentAttemptId).toBeNull();

      const storedEvent = await reloadEvent(result.externalPaymentEventId);
      expect(storedEvent.processedAt).toBeNull();
      expect(storedEvent.paymentAttempt).toBeNull();
    });

    it('never correlates by amount, due date, or any field other than provider_resource_id/externalReference', async () => {
      const transaction = await createTransaction({ amount: '200.00' });
      await createAttempt(transaction, {
        status: 'processing',
        providerResourceId: 'bill_a_totally_different_id',
        requestedAmount: '200.00',
      });

      // Same amount as the existing attempt, but neither providerResourceId nor
      // externalReference match anything — must not be correlated by coincidence.
      const result = await repository.recordAndApply(
        eventData({ providerResourceId: 'bill_unrelated', externalReference: null }),
      );

      expect(result.outcome).toBe('no_correlation');
    });
  });

  describe('unrecognized/future event types', () => {
    it('does not crash and defers for manual review', async () => {
      const transaction = await createTransaction();
      await createAttempt(transaction, { status: 'processing' });

      const result = await repository.recordAndApply(
        eventData({ eventType: 'BILL_SOMETHING_NEW' }),
      );

      expect(result.outcome).toBe('deferred_invalid_transition');

      const storedTransaction = await reloadTransaction(transaction.id);
      expect(storedTransaction.status).toBe('pending');
    });
  });

  describe('deferred event redelivery (race: event arrives before local state catches up)', () => {
    it('reprocesses a still-pending duplicate once local state allows it, and stays idempotent on a third delivery', async () => {
      const transaction = await createTransaction();
      // 'requested': the attempt is still in flight locally — PayBillService's own write to
      // 'processing' hasn't landed yet — even though Asaas already accepted the POST /bill and
      // is now reporting BILL_PAID. provider_resource_id is null for the same reason, so
      // correlation can only happen via externalReference (see AsaasWebhookRepository).
      const attempt = await createAttempt(transaction, {
        status: 'requested',
        providerResourceId: null,
      });
      const providerEventId = randomUUID();
      const billId = 'bill_race_000001';

      // Entrega 1: BILL_PAID arrives while the attempt is still 'requested' — fail-closed defer,
      // never mutates PaymentAttempt/Transaction.
      const first = await repository.recordAndApply(
        eventData({ providerEventId, externalReference: attempt.id, providerResourceId: billId }),
      );

      expect(first.outcome).toBe('deferred_invalid_transition');
      const afterFirst = await reloadEvent(first.externalPaymentEventId);
      expect(afterFirst.processedAt).toBeNull();

      const transactionAfterFirst = await reloadTransaction(transaction.id);
      expect(transactionAfterFirst.status).toBe('pending');

      // Local state catches up: PayBillService's own write finally lands.
      await appDataSource.manager.update(
        PaymentAttemptEntity,
        { id: attempt.id },
        { status: 'processing', providerResourceId: billId },
      );

      // Entrega 2: Asaas redelivers the SAME event id. Must be reprocessed, not just deduped.
      const second = await repository.recordAndApply(
        eventData({ providerEventId, externalReference: attempt.id, providerResourceId: billId }),
      );

      expect(second.outcome).toBe('confirmed');
      expect(second.externalPaymentEventId).toBe(first.externalPaymentEventId);

      const storedAttempt = await reloadAttempt(attempt.id);
      expect(storedAttempt.status).toBe('confirmed');
      expect(storedAttempt.confirmedAt).not.toBeNull();
      const confirmedAt = storedAttempt.confirmedAt;

      const transactionAfterSecond = await reloadTransaction(transaction.id);
      expect(transactionAfterSecond.status).toBe('paid');
      expect(transactionAfterSecond.paidAt).toEqual(PAID_AT);
      const paidAt = transactionAfterSecond.paidAt;

      const afterSecond = await reloadEvent(second.externalPaymentEventId);
      expect(afterSecond.processedAt).not.toBeNull();

      const eventCountAfterSecond = await appDataSource
        .getRepository(ExternalPaymentEventEntity)
        .count({ where: { providerEventId } });
      expect(eventCountAfterSecond).toBe(1);

      // Entrega 3: same event id again — now fully processed, so this must be a true no-op.
      const third = await repository.recordAndApply(
        eventData({ providerEventId, externalReference: attempt.id, providerResourceId: billId }),
      );

      expect(third.outcome).toBe('duplicate');
      expect(third.externalPaymentEventId).toBe(first.externalPaymentEventId);

      const finalAttempt = await reloadAttempt(attempt.id);
      expect(finalAttempt.status).toBe('confirmed');
      expect(finalAttempt.confirmedAt).toEqual(confirmedAt);

      const finalTransaction = await reloadTransaction(transaction.id);
      expect(finalTransaction.status).toBe('paid');
      expect(finalTransaction.paidAt).toEqual(paidAt);

      const finalEventCount = await appDataSource
        .getRepository(ExternalPaymentEventEntity)
        .count({ where: { providerEventId } });
      expect(finalEventCount).toBe(1);
    });

    it('reprocesses a still-pending no-correlation duplicate once the PaymentAttempt starts existing', async () => {
      const providerEventId = randomUUID();
      const billId = 'bill_not_yet_known_000001';

      // Entrega 1: no PaymentAttempt exists yet for this bill at all.
      const first = await repository.recordAndApply(
        eventData({ providerEventId, providerResourceId: billId, externalReference: null }),
      );

      expect(first.outcome).toBe('no_correlation');
      const afterFirst = await reloadEvent(first.externalPaymentEventId);
      expect(afterFirst.processedAt).toBeNull();
      expect(afterFirst.paymentAttempt).toBeNull();

      const transaction = await createTransaction();
      const attempt = await createAttempt(transaction, {
        status: 'processing',
        providerResourceId: billId,
      });

      // Entrega 2: same event id — correlation is now possible.
      const second = await repository.recordAndApply(
        eventData({ providerEventId, providerResourceId: billId, externalReference: null }),
      );

      expect(second.outcome).toBe('confirmed');
      expect(second.externalPaymentEventId).toBe(first.externalPaymentEventId);

      const storedAttempt = await reloadAttempt(attempt.id);
      expect(storedAttempt.status).toBe('confirmed');

      const storedTransaction = await reloadTransaction(transaction.id);
      expect(storedTransaction.status).toBe('paid');

      const eventCount = await appDataSource
        .getRepository(ExternalPaymentEventEntity)
        .count({ where: { providerEventId } });
      expect(eventCount).toBe(1);
    });

    it('keeps a redelivered BILL_REFUNDED deferred with no side effects (still-out-of-scope event stays pending)', async () => {
      const transaction = await createTransaction({ status: 'paid', paidAt: PAID_AT });
      const attempt = await createAttempt(transaction, {
        status: 'confirmed',
        confirmedAt: new Date(),
      });
      const providerEventId = randomUUID();

      const first = await repository.recordAndApply(
        eventData({ providerEventId, eventType: 'BILL_REFUNDED' }),
      );
      const second = await repository.recordAndApply(
        eventData({ providerEventId, eventType: 'BILL_REFUNDED' }),
      );

      expect(first.outcome).toBe('deferred_invalid_transition');
      expect(second.outcome).toBe('deferred_invalid_transition');
      expect(second.externalPaymentEventId).toBe(first.externalPaymentEventId);

      const afterSecond = await reloadEvent(second.externalPaymentEventId);
      expect(afterSecond.processedAt).toBeNull();

      const storedAttempt = await reloadAttempt(attempt.id);
      expect(storedAttempt.status).toBe('confirmed');

      const storedTransaction = await reloadTransaction(transaction.id);
      expect(storedTransaction.status).toBe('paid');
      expect(storedTransaction.paidAt).toEqual(PAID_AT);

      const eventCount = await appDataSource
        .getRepository(ExternalPaymentEventEntity)
        .count({ where: { providerEventId } });
      expect(eventCount).toBe(1);
    });

    it('serializes two concurrent redeliveries of the same still-pending event into a single reprocessing', async () => {
      const transaction = await createTransaction();
      const attempt = await createAttempt(transaction, {
        status: 'requested',
        providerResourceId: null,
      });
      const providerEventId = randomUUID();
      const billId = 'bill_race_concurrent_000001';

      const first = await repository.recordAndApply(
        eventData({ providerEventId, externalReference: attempt.id, providerResourceId: billId }),
      );
      expect(first.outcome).toBe('deferred_invalid_transition');

      await appDataSource.manager.update(
        PaymentAttemptEntity,
        { id: attempt.id },
        { status: 'processing', providerResourceId: billId },
      );

      const results = await Promise.allSettled([
        repository.recordAndApply(
          eventData({ providerEventId, externalReference: attempt.id, providerResourceId: billId }),
        ),
        repository.recordAndApply(
          eventData({ providerEventId, externalReference: attempt.id, providerResourceId: billId }),
        ),
      ]);

      const fulfilled = results.filter(
        (
          result,
        ): result is PromiseFulfilledResult<
          Awaited<ReturnType<typeof repository.recordAndApply>>
        > => result.status === 'fulfilled',
      );

      expect(fulfilled).toHaveLength(2);
      // Exactly one of the two concurrent redeliveries actually runs the business rule; the
      // other, after waiting on the row lock, sees processed_at already set and no-ops.
      const outcomes = fulfilled.map((result) => result.value.outcome).sort();
      expect(outcomes).toEqual(['confirmed', 'duplicate']);

      const storedAttempt = await reloadAttempt(attempt.id);
      expect(storedAttempt.status).toBe('confirmed');

      const storedTransaction = await reloadTransaction(transaction.id);
      expect(storedTransaction.status).toBe('paid');

      const eventCount = await appDataSource
        .getRepository(ExternalPaymentEventEntity)
        .count({ where: { providerEventId } });
      expect(eventCount).toBe(1);
    });
  });

  describe('concurrency', () => {
    it('serializes two concurrent BILL_PAID deliveries for the same attempt into a single confirmation', async () => {
      const transaction = await createTransaction();
      const attempt = await createAttempt(transaction, { status: 'processing' });

      const results = await Promise.allSettled([
        repository.recordAndApply(eventData({ providerEventId: randomUUID() })),
        repository.recordAndApply(eventData({ providerEventId: randomUUID() })),
      ]);

      const fulfilled = results.filter(
        (
          result,
        ): result is PromiseFulfilledResult<
          Awaited<ReturnType<typeof repository.recordAndApply>>
        > => result.status === 'fulfilled',
      );

      expect(fulfilled).toHaveLength(2);
      // Whichever ran first confirms; the second sees the already-confirmed status under lock.
      const outcomes = fulfilled.map((result) => result.value.outcome).sort();
      expect(outcomes).toEqual(['confirmed', 'idempotent_noop']);

      const storedAttempt = await reloadAttempt(attempt.id);
      expect(storedAttempt.status).toBe('confirmed');

      const storedTransaction = await reloadTransaction(transaction.id);
      expect(storedTransaction.status).toBe('paid');
    });
  });
});
