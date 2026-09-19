import { randomUUID } from 'node:crypto';

import express from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';

import { appDataSource } from '../src/database/data-source.js';
import { HouseholdMemberEntity } from '../src/database/entities/household-member.entity.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { TransactionEntity } from '../src/database/entities/transaction.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { TypeOrmPaymentAttemptRepository } from '../src/repositories/payment-attempt-repository.js';
import { TypeOrmTransactionRepository } from '../src/repositories/transaction-repository.js';
import { createTransactionRouter } from '../src/routes/transaction-routes.js';

const TEST_JWT_SECRET = Buffer.alloc(32, 11);

async function createToken(userId: string): Promise<string> {
  return new SignJWT({ email: 'member@example.com' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(TEST_JWT_SECRET);
}

function transactionUrl(householdId: string, transactionId: string): string {
  return `/api/households/${householdId}/transactions/${transactionId}`;
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

describe('GET /api/households/:householdId/transactions/:transactionId', () => {
  let owner: UserEntity;
  let member: UserEntity;
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
        email: `get-transaction-owner-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Owner',
      }),
    );
    member = await appDataSource.manager.save(
      appDataSource.manager.create(UserEntity, {
        email: `get-transaction-member-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Member',
      }),
    );
    outsider = await appDataSource.manager.save(
      appDataSource.manager.create(UserEntity, {
        email: `get-transaction-outsider-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Outsider',
      }),
    );

    household = await appDataSource.manager.save(
      appDataSource.manager.create(HouseholdEntity, {
        name: 'Get Transaction Household',
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
    await appDataSource.manager.save(
      appDataSource.manager.create(HouseholdMemberEntity, {
        household,
        user: member,
        role: 'member',
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
        description: 'Conta de luz',
        originalDescription: null,
        recurringTransaction: null,
        recurringPeriod: null,
        expenseNature: 'fixed',
      }),
    );
  });

  afterEach(async () => {
    await appDataSource.manager.delete(HouseholdEntity, { id: household.id });
    await appDataSource.manager.delete(UserEntity, { id: owner.id });
    await appDataSource.manager.delete(UserEntity, { id: member.id });
    await appDataSource.manager.delete(UserEntity, { id: outsider.id });
  });

  it('lets a household member (not just the owner) read a transaction', async () => {
    const app = buildApp();
    const token = await createToken(member.id);

    const response = await request(app)
      .get(transactionUrl(household.id, transaction.id))
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: transaction.id,
      amount: '200.00',
      description: 'Conta de luz',
      status: 'pending',
      dueDate: '2026-09-23',
    });
  });

  it('rejects a user outside the household', async () => {
    const app = buildApp();
    const token = await createToken(outsider.id);

    const response = await request(app)
      .get(transactionUrl(household.id, transaction.id))
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns 404 for a transaction id that does not exist in the household', async () => {
    const app = buildApp();
    const token = await createToken(owner.id);

    const response = await request(app)
      .get(transactionUrl(household.id, randomUUID()))
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TRANSACTION_NOT_FOUND');
  });

  it('returns 401 without a session', async () => {
    const app = buildApp();

    const response = await request(app).get(transactionUrl(household.id, transaction.id));

    expect(response.status).toBe(401);
  });
});
