import { randomUUID } from 'node:crypto';

import express from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';

import { appDataSource } from '../src/database/data-source.js';
import { HouseholdMemberEntity } from '../src/database/entities/household-member.entity.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { PaymentAttemptEntity } from '../src/database/entities/payment-attempt.entity.js';
import { TransactionEntity } from '../src/database/entities/transaction.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { TypeOrmPaymentAttemptRepository } from '../src/repositories/payment-attempt-repository.js';
import { TypeOrmTransactionRepository } from '../src/repositories/transaction-repository.js';
import { createTransactionRouter } from '../src/routes/transaction-routes.js';

const TEST_JWT_SECRET = Buffer.alloc(32, 13);

async function createToken(userId: string): Promise<string> {
  return new SignJWT({ email: 'member@example.com' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(TEST_JWT_SECRET);
}

function attemptUrl(householdId: string, transactionId: string): string {
  return `/api/households/${householdId}/transactions/${transactionId}/payment/bill/attempt`;
}

function buildApp() {
  const transactions = new TypeOrmTransactionRepository(appDataSource);
  const paymentAttempts = new TypeOrmPaymentAttemptRepository(appDataSource);
  const app = express();
  app.use(express.json());
  app.use(
    '/api/households/:householdId/transactions',
    createTransactionRouter(transactions, paymentAttempts, TEST_JWT_SECRET),
  );
  app.use(errorHandler);
  return app;
}

describe('GET /api/households/:householdId/transactions/:transactionId/payment/bill/attempt', () => {
  let owner: UserEntity;
  let outsider: UserEntity;
  let household: HouseholdEntity;
  let transaction: TransactionEntity;

  beforeAll(async () => {
    await appDataSource.initialize();
  });

  afterAll(async () => {
    await appDataSource.destroy();
  });

  beforeEach(async () => {
    owner = await appDataSource.manager.save(
      appDataSource.manager.create(UserEntity, {
        email: `get-attempt-owner-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Owner',
      }),
    );
    outsider = await appDataSource.manager.save(
      appDataSource.manager.create(UserEntity, {
        email: `get-attempt-outsider-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Outsider',
      }),
    );

    household = await appDataSource.manager.save(
      appDataSource.manager.create(HouseholdEntity, {
        name: 'Get Payment Attempt Household',
        currencyCode: 'BRL',
        createdBy: owner,
      }),
    );

    await appDataSource.manager.save(
      appDataSource.manager.create(HouseholdMemberEntity, {
        household,
        user: owner,
        role: 'owner',
      }),
    );

    transaction = await appDataSource.manager.save(
      appDataSource.manager.create(TransactionEntity, {
        household,
        category: null,
        createdBy: owner,
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
      }),
    );
  });

  afterEach(async () => {
    await appDataSource.manager.delete(PaymentAttemptEntity, {
      transaction: { id: transaction.id },
    });
    await appDataSource.manager.delete(HouseholdEntity, { id: household.id });
    await appDataSource.manager.delete(UserEntity, { id: owner.id });
    await appDataSource.manager.delete(UserEntity, { id: outsider.id });
  });

  it('returns null when the transaction has no payment attempt yet', async () => {
    const app = buildApp();
    const token = await createToken(owner.id);

    const response = await request(app)
      .get(attemptUrl(household.id, transaction.id))
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();
  });

  it('returns the most recent attempt without leaking internal fields', async () => {
    const older = await appDataSource.manager.save(
      appDataSource.manager.create(PaymentAttemptEntity, {
        transaction,
        initiatedBy: owner,
        kind: 'bill',
        provider: 'asaas',
        providerResourceId: 'bill_older',
        idempotencyKey: randomUUID(),
        status: 'failed',
        requestedAmount: '200.00',
        failureReason: 'first attempt failed',
        confirmedAt: null,
      }),
    );
    // Ensure a strictly later createdAt than `older` regardless of clock resolution.
    await appDataSource.manager.update(PaymentAttemptEntity, older.id, {
      createdAt: new Date('2026-09-18T10:00:00.000Z'),
    });
    const latest = await appDataSource.manager.save(
      appDataSource.manager.create(PaymentAttemptEntity, {
        transaction,
        initiatedBy: owner,
        kind: 'bill',
        provider: 'asaas',
        providerResourceId: 'bill_latest',
        idempotencyKey: randomUUID(),
        status: 'processing',
        requestedAmount: '200.00',
        failureReason: null,
        confirmedAt: null,
      }),
    );
    await appDataSource.manager.update(PaymentAttemptEntity, latest.id, {
      createdAt: new Date('2026-09-18T10:05:00.000Z'),
    });

    const app = buildApp();
    const token = await createToken(owner.id);

    const response = await request(app)
      .get(attemptUrl(household.id, transaction.id))
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: latest.id,
      status: 'processing',
      kind: 'bill',
    });
    expect(response.body.data).not.toHaveProperty('failureReason');
    expect(response.body.data).not.toHaveProperty('providerResourceId');
    expect(response.body.data).not.toHaveProperty('idempotencyKey');
  });

  it('rejects a user outside the household', async () => {
    const app = buildApp();
    const token = await createToken(outsider.id);

    const response = await request(app)
      .get(attemptUrl(household.id, transaction.id))
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns 404 for a transaction id that does not exist in the household', async () => {
    const app = buildApp();
    const token = await createToken(owner.id);

    const response = await request(app)
      .get(attemptUrl(household.id, randomUUID()))
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TRANSACTION_NOT_FOUND');
  });
});
