import { randomUUID } from 'node:crypto';

import { QueryFailedError, type DataSource, type EntityManager, type Repository } from 'typeorm';

import { appDataSource } from '../src/database/data-source.js';
import { HouseholdMemberEntity } from '../src/database/entities/household-member.entity.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { PaymentAttemptEntity } from '../src/database/entities/payment-attempt.entity.js';
import { TransactionEntity } from '../src/database/entities/transaction.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import { ForbiddenError } from '../src/errors/forbidden-error.js';
import { InvalidPaymentAmountError } from '../src/errors/invalid-payment-amount-error.js';
import { PaymentAttemptAlreadyActiveError } from '../src/errors/payment-attempt-already-active-error.js';
import { PaymentAttemptInvalidTransitionError } from '../src/errors/payment-attempt-invalid-transition-error.js';
import { PaymentAttemptNotFoundError } from '../src/errors/payment-attempt-not-found-error.js';
import { TransactionAlreadyPaidError } from '../src/errors/transaction-already-paid-error.js';
import { TransactionNotFoundError } from '../src/errors/transaction-not-found-error.js';
import type { PaymentAttemptRecord } from '../src/repositories/payment-attempt-repository.js';
import { TypeOrmPaymentAttemptRepository } from '../src/repositories/payment-attempt-repository.js';

const HOUSEHOLD_ID = randomUUID();
const OWNER_ID = randomUUID();
const TRANSACTION_ID = randomUUID();
const PAYMENT_ATTEMPT_ID = randomUUID();

const NOW = new Date('2026-02-01T10:00:00.000Z');

describe('TypeOrmPaymentAttemptRepository (authorization and validation)', () => {
  it('lets the household owner create a payment attempt', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const transaction = Object.assign(new TransactionEntity(), {
      id: TRANSACTION_ID,
      status: 'pending',
      amount: '150.00',
    });
    const findCalls: Array<{ entity: unknown; options: unknown }> = [];
    let createdData: Record<string, unknown> | undefined;
    const manager = {
      async findOne(entity: unknown, options: unknown): Promise<object | null> {
        findCalls.push({ entity, options });

        if (entity === HouseholdMemberEntity) {
          return membership;
        }

        if (entity === TransactionEntity) {
          return transaction;
        }

        return null;
      },
      getRepository(): Repository<PaymentAttemptEntity> {
        return {
          create(data: Record<string, unknown>): PaymentAttemptEntity {
            createdData = data;
            return Object.assign(new PaymentAttemptEntity(), data);
          },
          async save(entity: PaymentAttemptEntity): Promise<PaymentAttemptEntity> {
            return Object.assign(entity, {
              id: randomUUID(),
              createdAt: NOW,
              updatedAt: NOW,
            });
          },
        } as unknown as Repository<PaymentAttemptEntity>;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmPaymentAttemptRepository(dataSource);

    const result = await repository.createPaymentAttempt({
      householdId: HOUSEHOLD_ID,
      requesterId: OWNER_ID,
      transactionId: TRANSACTION_ID,
      kind: 'bill',
      requestedAmount: '150.0',
    });

    expect(findCalls).toHaveLength(3);
    expect(createdData).toMatchObject({
      transaction: { id: TRANSACTION_ID },
      initiatedBy: { id: OWNER_ID },
      kind: 'bill',
      provider: 'asaas',
      providerResourceId: null,
      status: 'requested',
      requestedAmount: '150.00',
      failureReason: null,
      confirmedAt: null,
    });
    expect(createdData).not.toHaveProperty('household');
    expect(typeof createdData?.idempotencyKey).toBe('string');
    expect(result).toMatchObject({
      transactionId: TRANSACTION_ID,
      initiatedBy: OWNER_ID,
      kind: 'bill',
      provider: 'asaas',
      status: 'requested',
      requestedAmount: '150.00',
      failureReason: null,
      confirmedAt: null,
    });
    expect(result).not.toHaveProperty('householdId');
  });

  it('rejects a household member (non-owner)', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'member',
    });
    let transactionLookupCalled = false;
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        if (entity === TransactionEntity) {
          transactionLookupCalled = true;
        }

        return membership;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmPaymentAttemptRepository(dataSource);

    await expect(
      repository.createPaymentAttempt({
        householdId: HOUSEHOLD_ID,
        requesterId: randomUUID(),
        transactionId: TRANSACTION_ID,
        kind: 'bill',
        requestedAmount: '150.00',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transactionLookupCalled).toBe(false);
  });

  it('rejects a user with no membership in the household', async () => {
    const manager = {
      async findOne(): Promise<null> {
        return null;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmPaymentAttemptRepository(dataSource);

    await expect(
      repository.createPaymentAttempt({
        householdId: HOUSEHOLD_ID,
        requesterId: randomUUID(),
        transactionId: TRANSACTION_ID,
        kind: 'bill',
        requestedAmount: '150.00',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a transaction that does not belong to the informed household', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        if (entity === HouseholdMemberEntity) {
          return membership;
        }

        return null;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmPaymentAttemptRepository(dataSource);

    await expect(
      repository.createPaymentAttempt({
        householdId: HOUSEHOLD_ID,
        requesterId: OWNER_ID,
        transactionId: TRANSACTION_ID,
        kind: 'bill',
        requestedAmount: '150.00',
      }),
    ).rejects.toBeInstanceOf(TransactionNotFoundError);
  });

  it('rejects a transaction that is already paid', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const transaction = Object.assign(new TransactionEntity(), {
      id: TRANSACTION_ID,
      status: 'paid',
      amount: '150.00',
    });
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity ? membership : transaction;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmPaymentAttemptRepository(dataSource);

    await expect(
      repository.createPaymentAttempt({
        householdId: HOUSEHOLD_ID,
        requesterId: OWNER_ID,
        transactionId: TRANSACTION_ID,
        kind: 'bill',
        requestedAmount: '150.00',
      }),
    ).rejects.toBeInstanceOf(TransactionAlreadyPaidError);
  });

  it('rejects a requested amount that does not match the transaction amount', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const transaction = Object.assign(new TransactionEntity(), {
      id: TRANSACTION_ID,
      status: 'pending',
      amount: '150.00',
    });
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        if (entity === HouseholdMemberEntity) {
          return membership;
        }

        if (entity === TransactionEntity) {
          return transaction;
        }

        return null;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmPaymentAttemptRepository(dataSource);

    await expect(
      repository.createPaymentAttempt({
        householdId: HOUSEHOLD_ID,
        requesterId: OWNER_ID,
        transactionId: TRANSACTION_ID,
        kind: 'bill',
        requestedAmount: '99.00',
      }),
    ).rejects.toBeInstanceOf(InvalidPaymentAmountError);
  });

  it('rejects a second active attempt for the same transaction', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const transaction = Object.assign(new TransactionEntity(), {
      id: TRANSACTION_ID,
      status: 'pending',
      amount: '150.00',
    });
    const existingAttempt = Object.assign(new PaymentAttemptEntity(), { id: randomUUID() });
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        if (entity === HouseholdMemberEntity) {
          return membership;
        }

        if (entity === TransactionEntity) {
          return transaction;
        }

        return existingAttempt;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmPaymentAttemptRepository(dataSource);

    await expect(
      repository.createPaymentAttempt({
        householdId: HOUSEHOLD_ID,
        requesterId: OWNER_ID,
        transactionId: TRANSACTION_ID,
        kind: 'bill',
        requestedAmount: '150.00',
      }),
    ).rejects.toBeInstanceOf(PaymentAttemptAlreadyActiveError);
  });

  it('the active-attempt lookup is not scoped by kind, so a different kind is blocked too', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const transaction = Object.assign(new TransactionEntity(), {
      id: TRANSACTION_ID,
      status: 'pending',
      amount: '150.00',
    });
    const activeAttemptCalls: Array<{ where?: Record<string, unknown> }> = [];
    let activeAttempt: PaymentAttemptEntity | null = null;
    const manager = {
      async findOne(
        entity: unknown,
        options: { where?: Record<string, unknown> },
      ): Promise<object | null> {
        if (entity === HouseholdMemberEntity) {
          return membership;
        }

        if (entity === TransactionEntity) {
          return transaction;
        }

        activeAttemptCalls.push(options);
        return activeAttempt;
      },
      getRepository(): Repository<PaymentAttemptEntity> {
        return {
          create(data: Record<string, unknown>): PaymentAttemptEntity {
            return Object.assign(new PaymentAttemptEntity(), data);
          },
          async save(entity: PaymentAttemptEntity): Promise<PaymentAttemptEntity> {
            const saved = Object.assign(entity, {
              id: randomUUID(),
              createdAt: NOW,
              updatedAt: NOW,
            });
            activeAttempt = saved;
            return saved;
          },
        } as unknown as Repository<PaymentAttemptEntity>;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmPaymentAttemptRepository(dataSource);

    const firstAttempt = await repository.createPaymentAttempt({
      householdId: HOUSEHOLD_ID,
      requesterId: OWNER_ID,
      transactionId: TRANSACTION_ID,
      kind: 'bill',
      requestedAmount: '150.00',
    });

    expect(firstAttempt.kind).toBe('bill');

    await expect(
      repository.createPaymentAttempt({
        householdId: HOUSEHOLD_ID,
        requesterId: OWNER_ID,
        transactionId: TRANSACTION_ID,
        kind: 'pix_transfer',
        requestedAmount: '150.00',
      }),
    ).rejects.toBeInstanceOf(PaymentAttemptAlreadyActiveError);

    expect(activeAttemptCalls).toHaveLength(2);

    for (const call of activeAttemptCalls) {
      expect(call.where).toMatchObject({ transaction: { id: TRANSACTION_ID } });
      expect(call.where).not.toHaveProperty('kind');
    }
  });

  it('converts the active-attempt UNIQUE index race into PaymentAttemptAlreadyActiveError', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const transaction = Object.assign(new TransactionEntity(), {
      id: TRANSACTION_ID,
      status: 'pending',
      amount: '150.00',
    });
    const driverError = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'uq_payment_attempts_active_per_transaction',
    });
    const queryError = new QueryFailedError('INSERT INTO payment_attempts', [], driverError);
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        if (entity === HouseholdMemberEntity) {
          return membership;
        }

        if (entity === TransactionEntity) {
          return transaction;
        }

        return null;
      },
      getRepository(): Repository<PaymentAttemptEntity> {
        return {
          create(data: Record<string, unknown>): PaymentAttemptEntity {
            return Object.assign(new PaymentAttemptEntity(), data);
          },
          async save(): Promise<PaymentAttemptEntity> {
            throw queryError;
          },
        } as unknown as Repository<PaymentAttemptEntity>;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmPaymentAttemptRepository(dataSource);

    await expect(
      repository.createPaymentAttempt({
        householdId: HOUSEHOLD_ID,
        requesterId: OWNER_ID,
        transactionId: TRANSACTION_ID,
        kind: 'bill',
        requestedAmount: '150.00',
      }),
    ).rejects.toBeInstanceOf(PaymentAttemptAlreadyActiveError);
  });
});

describe('TypeOrmPaymentAttemptRepository (status transitions)', () => {
  function buildManagerFor(attempt: PaymentAttemptEntity | null): {
    manager: EntityManager;
    dataSource: DataSource;
    findOneCalls: Array<{ entity: unknown; options: unknown }>;
    saved: PaymentAttemptEntity[];
  } {
    const findOneCalls: Array<{ entity: unknown; options: unknown }> = [];
    const saved: PaymentAttemptEntity[] = [];

    const manager = {
      async findOne(entity: unknown, options: unknown): Promise<PaymentAttemptEntity | null> {
        findOneCalls.push({ entity, options });
        return attempt;
      },
      getRepository(): Repository<PaymentAttemptEntity> {
        return {
          async save(entityToSave: PaymentAttemptEntity): Promise<PaymentAttemptEntity> {
            saved.push(entityToSave);
            return entityToSave;
          },
        } as unknown as Repository<PaymentAttemptEntity>;
      },
    } as unknown as EntityManager;

    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;

    return { manager, dataSource, findOneCalls, saved };
  }

  function requestedAttempt(overrides: Partial<PaymentAttemptEntity> = {}): PaymentAttemptEntity {
    return Object.assign(new PaymentAttemptEntity(), {
      id: PAYMENT_ATTEMPT_ID,
      transaction: Object.assign(new TransactionEntity(), { id: TRANSACTION_ID }),
      initiatedBy: Object.assign(new UserEntity(), { id: OWNER_ID }),
      kind: 'bill',
      provider: 'asaas',
      providerResourceId: null,
      idempotencyKey: 'idempotency-key',
      status: 'requested',
      requestedAmount: '150.00',
      failureReason: null,
      createdAt: NOW,
      updatedAt: NOW,
      confirmedAt: null,
      ...overrides,
    });
  }

  describe('markProcessing', () => {
    it('transitions requested -> processing and stores the provider resource id', async () => {
      const attempt = requestedAttempt();
      const { dataSource, saved } = buildManagerFor(attempt);
      const repository = new TypeOrmPaymentAttemptRepository(dataSource);

      const result = await repository.markProcessing({
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        providerResourceId: 'bill_000001',
      });

      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ status: 'processing', providerResourceId: 'bill_000001' });
      expect(result).toMatchObject({
        id: PAYMENT_ATTEMPT_ID,
        status: 'processing',
        providerResourceId: 'bill_000001',
      });
    });

    it.each(['processing', 'confirmed', 'failed', 'cancelled', 'uncertain'] as const)(
      'rejects transitioning from %s',
      async (status) => {
        const attempt = requestedAttempt({ status });
        const { dataSource } = buildManagerFor(attempt);
        const repository = new TypeOrmPaymentAttemptRepository(dataSource);

        await expect(
          repository.markProcessing({
            paymentAttemptId: PAYMENT_ATTEMPT_ID,
            providerResourceId: 'bill_000001',
          }),
        ).rejects.toBeInstanceOf(PaymentAttemptInvalidTransitionError);
      },
    );

    it('rejects a different provider resource id than the one already stored, without saving', async () => {
      const attempt = requestedAttempt({ providerResourceId: 'bill_existing' });
      const { dataSource, saved } = buildManagerFor(attempt);
      const repository = new TypeOrmPaymentAttemptRepository(dataSource);

      await expect(
        repository.markProcessing({
          paymentAttemptId: PAYMENT_ATTEMPT_ID,
          providerResourceId: 'bill_different',
        }),
      ).rejects.toBeInstanceOf(PaymentAttemptInvalidTransitionError);

      expect(saved).toHaveLength(0);
    });

    it('accepts the same provider resource id already stored (idempotent)', async () => {
      const attempt = requestedAttempt({ providerResourceId: 'bill_existing' });
      const { dataSource, saved } = buildManagerFor(attempt);
      const repository = new TypeOrmPaymentAttemptRepository(dataSource);

      const result = await repository.markProcessing({
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        providerResourceId: 'bill_existing',
      });

      expect(saved).toHaveLength(1);
      expect(result).toMatchObject({ status: 'processing', providerResourceId: 'bill_existing' });
    });

    it('rejects when the payment attempt does not exist', async () => {
      const { dataSource } = buildManagerFor(null);
      const repository = new TypeOrmPaymentAttemptRepository(dataSource);

      await expect(
        repository.markProcessing({
          paymentAttemptId: PAYMENT_ATTEMPT_ID,
          providerResourceId: 'bill_000001',
        }),
      ).rejects.toBeInstanceOf(PaymentAttemptNotFoundError);
    });
  });

  describe('markFailed', () => {
    it('transitions requested -> failed and stores the failure reason', async () => {
      const attempt = requestedAttempt();
      const { dataSource, saved } = buildManagerFor(attempt);
      const repository = new TypeOrmPaymentAttemptRepository(dataSource);

      const result = await repository.markFailed({
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        failureReason:
          'Asaas bill payment request failed with provider error code: invalid_request',
      });

      expect(saved[0]).toMatchObject({ status: 'failed' });
      expect(result.status).toBe('failed');
      expect(result.failureReason).toBe(
        'Asaas bill payment request failed with provider error code: invalid_request',
      );
    });

    it('rejects transitioning from a non-requested status', async () => {
      const attempt = requestedAttempt({ status: 'processing' });
      const { dataSource } = buildManagerFor(attempt);
      const repository = new TypeOrmPaymentAttemptRepository(dataSource);

      await expect(
        repository.markFailed({
          paymentAttemptId: PAYMENT_ATTEMPT_ID,
          failureReason: 'irrelevant',
        }),
      ).rejects.toBeInstanceOf(PaymentAttemptInvalidTransitionError);
    });
  });

  describe('markUncertain', () => {
    it('transitions requested -> uncertain and stores the failure reason', async () => {
      const attempt = requestedAttempt();
      const { dataSource, saved } = buildManagerFor(attempt);
      const repository = new TypeOrmPaymentAttemptRepository(dataSource);

      const result = await repository.markUncertain({
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        failureReason: 'Asaas bill payment request failed with provider error code: unavailable',
      });

      expect(saved[0]).toMatchObject({ status: 'uncertain' });
      expect(result.status).toBe('uncertain');
      expect(result.providerResourceId).toBeNull();
    });

    it('stores the provider resource id when given (provider accepted the payment but processing failed to persist)', async () => {
      const attempt = requestedAttempt();
      const { dataSource, saved } = buildManagerFor(attempt);
      const repository = new TypeOrmPaymentAttemptRepository(dataSource);

      const result = await repository.markUncertain({
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        failureReason:
          'Asaas accepted the bill payment but the local attempt could not be persisted as processing',
        providerResourceId: 'bill_555',
      });

      expect(saved[0]).toMatchObject({ status: 'uncertain', providerResourceId: 'bill_555' });
      expect(result.providerResourceId).toBe('bill_555');
    });

    it('rejects a different provider resource id than the one already stored, without saving', async () => {
      const attempt = requestedAttempt({ providerResourceId: 'bill_existing' });
      const { dataSource, saved } = buildManagerFor(attempt);
      const repository = new TypeOrmPaymentAttemptRepository(dataSource);

      await expect(
        repository.markUncertain({
          paymentAttemptId: PAYMENT_ATTEMPT_ID,
          failureReason: 'mismatch',
          providerResourceId: 'bill_different',
        }),
      ).rejects.toBeInstanceOf(PaymentAttemptInvalidTransitionError);

      expect(saved).toHaveLength(0);
    });

    it('rejects transitioning from a non-requested status', async () => {
      const attempt = requestedAttempt({ status: 'uncertain' });
      const { dataSource } = buildManagerFor(attempt);
      const repository = new TypeOrmPaymentAttemptRepository(dataSource);

      await expect(
        repository.markUncertain({
          paymentAttemptId: PAYMENT_ATTEMPT_ID,
          failureReason: 'irrelevant',
        }),
      ).rejects.toBeInstanceOf(PaymentAttemptInvalidTransitionError);
    });
  });
});

describe('TypeOrmPaymentAttemptRepository (real PostgreSQL concurrency)', () => {
  let user: UserEntity;
  let household: HouseholdEntity;
  let transaction: TransactionEntity;

  beforeAll(async () => {
    await appDataSource.initialize();
  });

  afterAll(async () => {
    await appDataSource.destroy();
  });

  beforeEach(async () => {
    user = await appDataSource.manager.save(
      appDataSource.manager.create(UserEntity, {
        email: `payment-attempt-concurrency-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Concurrency Test User',
      }),
    );

    household = await appDataSource.manager.save(
      appDataSource.manager.create(HouseholdEntity, {
        name: 'Concurrency Test Household',
        currencyCode: 'BRL',
        createdBy: user,
      }),
    );

    await appDataSource.manager.save(
      appDataSource.manager.create(HouseholdMemberEntity, {
        household,
        user,
        role: 'owner',
      }),
    );

    transaction = await appDataSource.manager.save(
      appDataSource.manager.create(TransactionEntity, {
        household,
        category: null,
        createdBy: user,
        type: 'expense',
        amount: '200.00',
        transactionDate: '2026-02-01',
        dueDate: '2026-02-10',
        paidAt: null,
        status: 'pending',
        source: 'manual',
        externalId: null,
        description: null,
        originalDescription: null,
        recurringTransaction: null,
        recurringPeriod: null,
        expenseNature: null,
      }),
    );
  });

  afterEach(async () => {
    // transaction_id is RESTRICT, so any PaymentAttempt left over from the test must be
    // cleared before the household delete cascades into deleting the transaction.
    await appDataSource.manager.delete(PaymentAttemptEntity, {
      transaction: { id: transaction.id },
    });
    await appDataSource.manager.delete(HouseholdEntity, { id: household.id });
    await appDataSource.manager.delete(UserEntity, { id: user.id });
  });

  it('allows at most one active attempt when two callers race for the same transaction and kind', async () => {
    const repository = new TypeOrmPaymentAttemptRepository(appDataSource);

    const results = await Promise.allSettled([
      repository.createPaymentAttempt({
        householdId: household.id,
        requesterId: user.id,
        transactionId: transaction.id,
        kind: 'bill',
        requestedAmount: '200.00',
      }),
      repository.createPaymentAttempt({
        householdId: household.id,
        requesterId: user.id,
        transactionId: transaction.id,
        kind: 'bill',
        requestedAmount: '200.00',
      }),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<PaymentAttemptRecord> =>
        result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(PaymentAttemptAlreadyActiveError);

    const activeAttempts = await appDataSource
      .getRepository(PaymentAttemptEntity)
      .find({ where: { transaction: { id: transaction.id } } });

    expect(activeAttempts).toHaveLength(1);
    expect(activeAttempts[0]?.status).toBe('requested');
  });

  it('allows at most one active attempt when two callers race with different kinds for the same transaction', async () => {
    const repository = new TypeOrmPaymentAttemptRepository(appDataSource);

    const results = await Promise.allSettled([
      repository.createPaymentAttempt({
        householdId: household.id,
        requesterId: user.id,
        transactionId: transaction.id,
        kind: 'bill',
        requestedAmount: '200.00',
      }),
      repository.createPaymentAttempt({
        householdId: household.id,
        requesterId: user.id,
        transactionId: transaction.id,
        kind: 'pix_transfer',
        requestedAmount: '200.00',
      }),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<PaymentAttemptRecord> =>
        result.status === 'fulfilled',
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(PaymentAttemptAlreadyActiveError);

    const activeAttempts = await appDataSource
      .getRepository(PaymentAttemptEntity)
      .find({ where: { transaction: { id: transaction.id } } });

    expect(activeAttempts).toHaveLength(1);
    expect(activeAttempts[0]?.status).toBe('requested');
    expect(['bill', 'pix_transfer']).toContain(activeAttempts[0]?.kind);
  });
});
