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
import { AsaasClientError } from '../src/integrations/asaas/asaas-client.error.js';
import type {
  AsaasBillPayment,
  AsaasBillSimulation,
  AsaasCreateBillPaymentInput,
  AsaasSimulateBillPaymentInput,
} from '../src/integrations/asaas/asaas-client.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { TypeOrmPaymentAttemptRepository } from '../src/repositories/payment-attempt-repository.js';
import { TypeOrmTransactionRepository } from '../src/repositories/transaction-repository.js';
import type { AsaasBillOperationsClient } from '../src/routes/transaction-routes.js';
import { createTransactionRouter } from '../src/routes/transaction-routes.js';

const TEST_JWT_SECRET = Buffer.alloc(32, 9);
const NOW = new Date('2026-09-18T12:00:00.000Z');

class FakeAsaasBillClient implements AsaasBillOperationsClient {
  calls: AsaasCreateBillPaymentInput[] = [];

  constructor(private readonly result: AsaasBillPayment | Error = defaultBillPayment()) {}

  async simulateBillPayment(_input: AsaasSimulateBillPaymentInput): Promise<AsaasBillSimulation> {
    throw new Error('Not used in pay-bill tests.');
  }

  async createBillPayment(input: AsaasCreateBillPaymentInput): Promise<AsaasBillPayment> {
    this.calls.push(input);

    if (this.result instanceof Error) {
      throw this.result;
    }

    return this.result;
  }
}

class DelayedFakeAsaasBillClient implements AsaasBillOperationsClient {
  callCount = 0;

  async simulateBillPayment(_input: AsaasSimulateBillPaymentInput): Promise<AsaasBillSimulation> {
    throw new Error('Not used in pay-bill tests.');
  }

  async createBillPayment(input: AsaasCreateBillPaymentInput): Promise<AsaasBillPayment> {
    this.callCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return defaultBillPayment({ id: `bill_${input.identificationField.slice(0, 5)}` });
  }
}

function defaultBillPayment(overrides: Partial<AsaasBillPayment> = {}): AsaasBillPayment {
  return {
    id: 'bill_000001',
    status: 'PENDING',
    value: 200,
    dueDate: '2026-09-23',
    scheduleDate: null,
    ...overrides,
  };
}

async function createToken(userId: string): Promise<string> {
  return new SignJWT({ email: 'owner@example.com' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(TEST_JWT_SECRET);
}

function payBillUrl(householdId: string, transactionId: string): string {
  return `/api/households/${householdId}/transactions/${transactionId}/payment/bill`;
}

function buildApp(asaasClient?: AsaasBillOperationsClient) {
  const transactions = new TypeOrmTransactionRepository(appDataSource);
  const paymentAttempts = new TypeOrmPaymentAttemptRepository(appDataSource);
  const app = express();
  app.use(express.json());
  app.use(
    '/api/households/:householdId/transactions',
    createTransactionRouter(transactions, paymentAttempts, TEST_JWT_SECRET, undefined, asaasClient),
  );
  app.use(errorHandler);
  return app;
}

describe('POST /api/households/:householdId/transactions/:transactionId/payment/bill', () => {
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
        email: `pay-bill-owner-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Owner',
      }),
    );
    member = await appDataSource.manager.save(
      appDataSource.manager.create(UserEntity, {
        email: `pay-bill-member-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Member',
      }),
    );
    outsider = await appDataSource.manager.save(
      appDataSource.manager.create(UserEntity, {
        email: `pay-bill-outsider-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Outsider',
      }),
    );

    household = await appDataSource.manager.save(
      appDataSource.manager.create(HouseholdEntity, {
        name: 'Pay Bill Household',
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
    await appDataSource.manager.delete(UserEntity, { id: member.id });
    await appDataSource.manager.delete(UserEntity, { id: outsider.id });
  });

  it('returns 503 when the payment provider is not configured', async () => {
    const app = buildApp(undefined);
    const token = await createToken(owner.id);

    const response = await request(app)
      .post(payBillUrl(household.id, transaction.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: 'field' });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('lets the owner pay the bill and moves the attempt to processing', async () => {
    const asaasClient = new FakeAsaasBillClient(
      defaultBillPayment({ id: 'bill_abc', status: 'PENDING' }),
    );
    const app = buildApp(asaasClient);
    const token = await createToken(owner.id);

    const response = await request(app)
      .post(payBillUrl(household.id, transaction.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: '03399.77779 29900.000000 04751.101017 1 81510000002990' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      paymentAttempt: {
        id: expect.any(String),
        status: 'processing',
        kind: 'bill',
      },
      provider: { status: 'PENDING' },
    });
    expect(JSON.stringify(response.body)).not.toContain('81510000002990');

    const stored = await appDataSource
      .getRepository(PaymentAttemptEntity)
      .findOneOrFail({ where: { transaction: { id: transaction.id } } });
    expect(stored.status).toBe('processing');
    expect(stored.providerResourceId).toBe('bill_abc');

    // externalReference sent to Asaas must be the attempt's own id — the stable, pre-existing,
    // non-sensitive identifier that lets us reconcile this payment later if provider_resource_id
    // is ever missing.
    expect(asaasClient.calls).toEqual([expect.objectContaining({ externalReference: stored.id })]);

    const storedTransaction = await appDataSource
      .getRepository(TransactionEntity)
      .findOneOrFail({ where: { id: transaction.id } });
    expect(storedTransaction.status).toBe('pending');
    expect(storedTransaction.paidAt).toBeNull();
  });

  it('rejects a household member (owner-only operation)', async () => {
    const asaasClient = new FakeAsaasBillClient();
    const app = buildApp(asaasClient);
    const token = await createToken(member.id);

    const response = await request(app)
      .post(payBillUrl(household.id, transaction.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: 'field' });

    expect(response.status).toBe(403);
    expect(asaasClient.calls).toHaveLength(0);
  });

  it('rejects a user outside the household', async () => {
    const asaasClient = new FakeAsaasBillClient();
    const app = buildApp(asaasClient);
    const token = await createToken(outsider.id);

    const response = await request(app)
      .post(payBillUrl(household.id, transaction.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: 'field' });

    expect(response.status).toBe(403);
    expect(asaasClient.calls).toHaveLength(0);
  });

  it('rejects a payload missing identificationField', async () => {
    const app = buildApp(new FakeAsaasBillClient());
    const token = await createToken(owner.id);

    const response = await request(app)
      .post(payBillUrl(household.id, transaction.id))
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an already-paid transaction without creating a payment attempt', async () => {
    await appDataSource.manager.update(
      TransactionEntity,
      { id: transaction.id },
      { status: 'paid', paidAt: NOW },
    );
    const asaasClient = new FakeAsaasBillClient();
    const app = buildApp(asaasClient);
    const token = await createToken(owner.id);

    const response = await request(app)
      .post(payBillUrl(household.id, transaction.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: 'field' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('TRANSACTION_ALREADY_PAID');
    expect(asaasClient.calls).toHaveLength(0);

    const attempts = await appDataSource
      .getRepository(PaymentAttemptEntity)
      .find({ where: { transaction: { id: transaction.id } } });
    expect(attempts).toHaveLength(0);
  });

  it.each([
    ['invalid_request', 422, 'INVALID_BILL'],
    ['authentication', 502, 'PROVIDER_ERROR'],
  ] as const)(
    'maps a definitive Asaas rejection (%s) to HTTP %d and marks the attempt failed',
    async (code, status, errorCode) => {
      const asaasClient = new FakeAsaasBillClient(
        new AsaasClientError({ code, message: 'Asaas failure' }),
      );
      const app = buildApp(asaasClient);
      const token = await createToken(owner.id);

      const response = await request(app)
        .post(payBillUrl(household.id, transaction.id))
        .set('Authorization', `Bearer ${token}`)
        .send({ identificationField: 'field' });

      expect(response.status).toBe(status);
      expect(response.body.error.code).toBe(errorCode);

      const stored = await appDataSource
        .getRepository(PaymentAttemptEntity)
        .findOneOrFail({ where: { transaction: { id: transaction.id } } });
      expect(stored.status).toBe('failed');

      const storedTransaction = await appDataSource
        .getRepository(TransactionEntity)
        .findOneOrFail({ where: { id: transaction.id } });
      expect(storedTransaction.status).toBe('pending');
      expect(storedTransaction.paidAt).toBeNull();
    },
  );

  it.each(['unavailable', 'unknown', 'rate_limit'] as const)(
    'marks the attempt uncertain (not failed) for a %s outcome, and keeps blocking new attempts',
    async (code) => {
      const asaasClient = new FakeAsaasBillClient(
        new AsaasClientError({ code, message: 'Asaas timeout' }),
      );
      const app = buildApp(asaasClient);
      const token = await createToken(owner.id);

      const response = await request(app)
        .post(payBillUrl(household.id, transaction.id))
        .set('Authorization', `Bearer ${token}`)
        .send({ identificationField: 'field' });

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('PROVIDER_RESPONSE_UNCERTAIN');

      const stored = await appDataSource
        .getRepository(PaymentAttemptEntity)
        .findOneOrFail({ where: { transaction: { id: transaction.id } } });
      expect(stored.status).toBe('uncertain');

      // A second attempt must stay blocked while the first is uncertain — this is exactly
      // what the 'uncertain' status exists to prevent (see the migration that added it):
      // no automatic retry may reach the provider while the first outcome is unknown.
      const secondAttemptAsaasClient = new FakeAsaasBillClient();
      const secondApp = buildApp(secondAttemptAsaasClient);
      const secondResponse = await request(secondApp)
        .post(payBillUrl(household.id, transaction.id))
        .set('Authorization', `Bearer ${token}`)
        .send({ identificationField: 'field' });

      expect(secondResponse.status).toBe(409);
      expect(secondResponse.body.error.code).toBe('PAYMENT_ATTEMPT_ALREADY_ACTIVE');
      expect(secondAttemptAsaasClient.calls).toHaveLength(0);
    },
  );

  it('allows at most one of two concurrent requests to reach the provider', async () => {
    const asaasClient = new DelayedFakeAsaasBillClient();
    const app = buildApp(asaasClient);
    const token = await createToken(owner.id);

    const results = await Promise.allSettled([
      request(app)
        .post(payBillUrl(household.id, transaction.id))
        .set('Authorization', `Bearer ${token}`)
        .send({ identificationField: 'field-one' }),
      request(app)
        .post(payBillUrl(household.id, transaction.id))
        .set('Authorization', `Bearer ${token}`)
        .send({ identificationField: 'field-two' }),
    ]);

    const responses = results.map((result) => {
      if (result.status !== 'fulfilled') {
        throw result.reason;
      }
      return result.value;
    });

    const succeeded = responses.filter((response) => response.status === 200);
    const blocked = responses.filter(
      (response) =>
        response.status === 409 && response.body.error.code === 'PAYMENT_ATTEMPT_ALREADY_ACTIVE',
    );

    expect(succeeded).toHaveLength(1);
    expect(blocked).toHaveLength(1);
    expect(asaasClient.callCount).toBe(1);

    const attempts = await appDataSource
      .getRepository(PaymentAttemptEntity)
      .find({ where: { transaction: { id: transaction.id } } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe('processing');
  });
});
