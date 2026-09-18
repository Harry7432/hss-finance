import { randomUUID } from 'node:crypto';

import type { QueryRunner } from 'typeorm';

import { appDataSource } from '../src/database/data-source.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { PaymentAttemptEntity } from '../src/database/entities/payment-attempt.entity.js';
import { TransactionEntity } from '../src/database/entities/transaction.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';

describe('PaymentAttemptEntity', () => {
  let queryRunner: QueryRunner;
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
    queryRunner = appDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    user = await queryRunner.manager.save(
      queryRunner.manager.create(UserEntity, {
        email: `payment-attempt-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Payment Attempt Test User',
      }),
    );

    household = await queryRunner.manager.save(
      queryRunner.manager.create(HouseholdEntity, {
        name: 'Payment Attempt Test Household',
        currencyCode: 'BRL',
        createdBy: user,
      }),
    );

    transaction = await queryRunner.manager.save(
      queryRunner.manager.create(TransactionEntity, {
        household,
        category: null,
        createdBy: user,
        type: 'expense',
        amount: '150.00',
        transactionDate: '2026-01-10',
        dueDate: '2026-01-15',
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
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  });

  function buildAttempt(
    overrides: Partial<PaymentAttemptEntity> = {},
  ): Partial<PaymentAttemptEntity> {
    return {
      transaction,
      initiatedBy: user,
      kind: 'bill',
      provider: 'asaas',
      providerResourceId: null,
      idempotencyKey: randomUUID(),
      status: 'requested',
      requestedAmount: '150.00',
      failureReason: null,
      confirmedAt: null,
      ...overrides,
    };
  }

  it('creates a payment attempt with all required fields', async () => {
    const attempt = await queryRunner.manager.save(
      queryRunner.manager.create(PaymentAttemptEntity, buildAttempt()),
    );

    expect(attempt.id).toBeDefined();
    expect(attempt.status).toBe('requested');
    expect(attempt.provider).toBe('asaas');
    expect(attempt.createdAt).toBeInstanceOf(Date);
    expect(attempt.confirmedAt).toBeNull();
  });

  it('accepts every allowed kind value', async () => {
    const allowedKinds = ['bill', 'pix_transfer'] as const;

    for (const kind of allowedKinds) {
      const attempt = await queryRunner.manager.save(
        queryRunner.manager.create(PaymentAttemptEntity, buildAttempt({ kind })),
      );

      expect(attempt.kind).toBe(kind);

      // Only one active attempt is allowed per transaction regardless of kind, so this one
      // is deleted before the next iteration creates another active attempt.
      await queryRunner.manager.delete(PaymentAttemptEntity, { id: attempt.id });
    }
  });

  it('rejects an invalid kind', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ kind: 'boleto' as unknown as PaymentAttemptEntity['kind'] }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('rejects an invalid provider', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ provider: 'stripe' as unknown as PaymentAttemptEntity['provider'] }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('accepts every allowed status value', async () => {
    // requested/processing are the "active" statuses guarded by the partial unique index
    // (now scoped to transaction_id alone, regardless of kind), so each attempt is deleted
    // right after being asserted to avoid tripping that constraint on the next iteration.
    const allowedStatuses = [
      { status: 'requested', kind: 'bill' },
      { status: 'processing', kind: 'pix_transfer' },
      { status: 'failed', kind: 'bill' },
      { status: 'cancelled', kind: 'pix_transfer' },
    ] as const;

    for (const { status, kind } of allowedStatuses) {
      const attempt = await queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ idempotencyKey: randomUUID(), status, kind }),
        ),
      );

      expect(attempt.status).toBe(status);

      await queryRunner.manager.delete(PaymentAttemptEntity, { id: attempt.id });
    }
  });

  it('rejects an invalid status', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ status: 'succeeded' as unknown as PaymentAttemptEntity['status'] }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('rejects a non-positive requested amount', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(PaymentAttemptEntity, buildAttempt({ requestedAmount: '0' })),
      ),
    ).rejects.toThrow();
  });

  it('rejects confirmed status without confirmedAt', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ status: 'confirmed', confirmedAt: null }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('rejects confirmedAt set on a non-confirmed status', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ status: 'requested', confirmedAt: new Date() }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('accepts confirmed status with confirmedAt set', async () => {
    const attempt = await queryRunner.manager.save(
      queryRunner.manager.create(
        PaymentAttemptEntity,
        buildAttempt({ status: 'confirmed', confirmedAt: new Date() }),
      ),
    );

    expect(attempt.status).toBe('confirmed');
    expect(attempt.confirmedAt).toBeInstanceOf(Date);
  });

  it('rejects a duplicate idempotency key', async () => {
    const idempotencyKey = randomUUID();

    // The first attempt is left in a non-active status so this failure is isolated to the
    // idempotency_key UNIQUE constraint, not the active-per-transaction partial unique index.
    await queryRunner.manager.save(
      queryRunner.manager.create(
        PaymentAttemptEntity,
        buildAttempt({ idempotencyKey, status: 'failed' }),
      ),
    );

    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ idempotencyKey, kind: 'pix_transfer' }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('rejects an attempt referencing a non-existent transaction', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ transaction: { id: randomUUID() } as TransactionEntity }),
        ),
      ),
    ).rejects.toThrow();
  });

  it('rejects an attempt referencing a non-existent initiator', async () => {
    await expect(
      queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ initiatedBy: { id: randomUUID() } as UserEntity }),
        ),
      ),
    ).rejects.toThrow();
  });

  describe('partial unique index on active attempts (real PostgreSQL constraint)', () => {
    it('rejects a second active attempt for the same transaction and same kind', async () => {
      await queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ kind: 'bill', status: 'requested' }),
        ),
      );

      await expect(
        queryRunner.manager.save(
          queryRunner.manager.create(
            PaymentAttemptEntity,
            buildAttempt({ idempotencyKey: randomUUID(), kind: 'bill', status: 'processing' }),
          ),
        ),
      ).rejects.toThrow();
    });

    it('an active bill attempt blocks a pix_transfer attempt on the same transaction', async () => {
      await queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ kind: 'bill', status: 'requested' }),
        ),
      );

      await expect(
        queryRunner.manager.save(
          queryRunner.manager.create(
            PaymentAttemptEntity,
            buildAttempt({
              idempotencyKey: randomUUID(),
              kind: 'pix_transfer',
              status: 'requested',
            }),
          ),
        ),
      ).rejects.toThrow();
    });

    it('an active pix_transfer attempt blocks a bill attempt on the same transaction', async () => {
      await queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ kind: 'pix_transfer', status: 'requested' }),
        ),
      );

      await expect(
        queryRunner.manager.save(
          queryRunner.manager.create(
            PaymentAttemptEntity,
            buildAttempt({ idempotencyKey: randomUUID(), kind: 'bill', status: 'requested' }),
          ),
        ),
      ).rejects.toThrow();
    });

    it('allows a new attempt of any kind after the previous one failed', async () => {
      await queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ kind: 'bill', status: 'failed', failureReason: 'provider timeout' }),
        ),
      );

      const secondAttempt = await queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({
            idempotencyKey: randomUUID(),
            kind: 'pix_transfer',
            status: 'requested',
          }),
        ),
      );

      expect(secondAttempt.id).toBeDefined();
    });

    it('allows a new attempt of any kind after the previous one was cancelled', async () => {
      await queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ kind: 'pix_transfer', status: 'cancelled' }),
        ),
      );

      const secondAttempt = await queryRunner.manager.save(
        queryRunner.manager.create(
          PaymentAttemptEntity,
          buildAttempt({ idempotencyKey: randomUUID(), kind: 'bill', status: 'requested' }),
        ),
      );

      expect(secondAttempt.id).toBeDefined();
    });
  });
});
