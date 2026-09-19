import { randomUUID } from 'node:crypto';

import express from 'express';
import request from 'supertest';

import { appDataSource } from '../src/database/data-source.js';
import { ExternalPaymentEventEntity } from '../src/database/entities/external-payment-event.entity.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { HouseholdMemberEntity } from '../src/database/entities/household-member.entity.js';
import { PaymentAttemptEntity } from '../src/database/entities/payment-attempt.entity.js';
import { TransactionEntity } from '../src/database/entities/transaction.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { TypeOrmAsaasWebhookRepository } from '../src/repositories/asaas-webhook-repository.js';
import { createAsaasWebhookRouter } from '../src/routes/asaas-webhook-routes.js';

const WEBHOOK_TOKEN = 'whsec_test_token_1234567890';
const FAKE_ASAAS_API_KEY = '$aact_hmlg_not_the_webhook_token';
const WEBHOOK_URL = '/api/webhooks/asaas';

function buildApp(webhookToken: string | undefined) {
  const webhookRepository = new TypeOrmAsaasWebhookRepository(appDataSource);
  const app = express();
  app.use(express.json());
  app.use(WEBHOOK_URL, createAsaasWebhookRouter(webhookRepository, webhookToken));
  app.use(errorHandler);
  return app;
}

function billPaidPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `evt_${randomUUID()}`,
    event: 'BILL_PAID',
    bill: {
      id: 'bill_e2e_000001',
      status: 'PAID',
      paymentDate: '2026-09-18',
      externalReference: null,
      ...overrides,
    },
  };
}

describe('POST /api/webhooks/asaas', () => {
  let user: UserEntity;
  let household: HouseholdEntity;
  let transaction: TransactionEntity;
  let attempt: PaymentAttemptEntity;

  beforeAll(async () => {
    await appDataSource.initialize();
  });

  afterAll(async () => {
    await appDataSource.destroy();
  });

  beforeEach(async () => {
    user = await appDataSource.manager.save(
      appDataSource.manager.create(UserEntity, {
        email: `asaas-webhook-e2e-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Webhook E2E User',
      }),
    );
    household = await appDataSource.manager.save(
      appDataSource.manager.create(HouseholdEntity, {
        name: 'Webhook E2E Household',
        currencyCode: 'BRL',
        createdBy: user,
      }),
    );
    await appDataSource.manager.save(
      appDataSource.manager.create(HouseholdMemberEntity, { household, user, role: 'owner' }),
    );
    transaction = await appDataSource.manager.save(
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
      }),
    );
    attempt = await appDataSource.manager.save(
      appDataSource.manager.create(PaymentAttemptEntity, {
        transaction,
        initiatedBy: user,
        kind: 'bill',
        provider: 'asaas',
        providerResourceId: 'bill_e2e_000001',
        idempotencyKey: randomUUID(),
        status: 'processing',
        requestedAmount: '200.00',
        failureReason: null,
        confirmedAt: null,
      }),
    );
  });

  afterEach(async () => {
    // Every event created in this file correlates to `attempt` (all payloads target
    // bill_e2e_000001), so scoping cleanup by payment_attempt_id is exact and safe to run
    // concurrently with other test files hitting the same table.
    await appDataSource.manager.delete(ExternalPaymentEventEntity, {
      paymentAttempt: { id: attempt.id },
    });
    await appDataSource.manager.delete(PaymentAttemptEntity, {
      transaction: { id: transaction.id },
    });
    await appDataSource.manager.delete(HouseholdEntity, { id: household.id });
    await appDataSource.manager.delete(UserEntity, { id: user.id });
  });

  describe('configuration and authentication', () => {
    it('returns 503 when the webhook token is not configured (fails closed)', async () => {
      const app = buildApp(undefined);

      const response = await request(app).post(WEBHOOK_URL).send(billPaidPayload());

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('WEBHOOK_NOT_CONFIGURED');
    });

    it('rejects a request with no asaas-access-token header', async () => {
      const app = buildApp(WEBHOOK_TOKEN);

      const response = await request(app).post(WEBHOOK_URL).send(billPaidPayload());

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a request with the wrong token', async () => {
      const app = buildApp(WEBHOOK_TOKEN);

      const response = await request(app)
        .post(WEBHOOK_URL)
        .set('asaas-access-token', 'wrong-token')
        .send(billPaidPayload());

      expect(response.status).toBe(401);
    });

    it('rejects the Asaas API key used in the webhook token header (separate secrets, never interchangeable)', async () => {
      const app = buildApp(WEBHOOK_TOKEN);

      const response = await request(app)
        .post(WEBHOOK_URL)
        .set('asaas-access-token', FAKE_ASAAS_API_KEY)
        .send(billPaidPayload());

      expect(response.status).toBe(401);
    });

    it('rejects a token shorter than the configured secret with 401, not a 500 from timingSafeEqual', async () => {
      const app = buildApp(WEBHOOK_TOKEN);

      const response = await request(app)
        .post(WEBHOOK_URL)
        .set('asaas-access-token', 'short')
        .send(billPaidPayload());

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects a token longer than the configured secret with 401, not a 500 from timingSafeEqual', async () => {
      const app = buildApp(WEBHOOK_TOKEN);

      const response = await request(app)
        .post(WEBHOOK_URL)
        .set('asaas-access-token', `${WEBHOOK_TOKEN}-and-then-some-extra-characters`)
        .send(billPaidPayload());

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('accepts a request with the correct token and never echoes it back', async () => {
      const app = buildApp(WEBHOOK_TOKEN);

      const response = await request(app)
        .post(WEBHOOK_URL)
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(billPaidPayload());

      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toContain(WEBHOOK_TOKEN);
      expect(JSON.stringify(response.headers)).not.toContain(WEBHOOK_TOKEN);
    });
  });

  describe('payload validation', () => {
    it('rejects a payload missing required fields with 400, without persisting anything', async () => {
      const app = buildApp(WEBHOOK_TOKEN);
      const before = await appDataSource.query(
        'SELECT count(*)::int AS count FROM external_payment_events',
      );

      const response = await request(app)
        .post(WEBHOOK_URL)
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send({ not: 'a valid asaas payload' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');

      const after = await appDataSource.query(
        'SELECT count(*)::int AS count FROM external_payment_events',
      );
      // Compared against a baseline (not asserted to be zero) since other test files/workers
      // may be inserting unrelated rows into this table concurrently.
      expect(after[0].count).toBe(before[0].count);
    });
  });

  describe('BILL_PAID happy path (real PostgreSQL)', () => {
    it('confirms the payment attempt and marks the Transaction paid', async () => {
      const app = buildApp(WEBHOOK_TOKEN);
      const beforeRequest = new Date();

      const response = await request(app)
        .post(WEBHOOK_URL)
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(billPaidPayload());

      const afterRequest = new Date();
      expect(response.status).toBe(200);

      const storedAttempt = await appDataSource
        .getRepository(PaymentAttemptEntity)
        .findOneOrFail({ where: { id: attempt.id } });
      expect(storedAttempt.status).toBe('confirmed');
      expect(storedAttempt.confirmedAt).not.toBeNull();

      const storedTransaction = await appDataSource
        .getRepository(TransactionEntity)
        .findOneOrFail({ where: { id: transaction.id } });
      expect(storedTransaction.status).toBe('paid');
      // paid_at = the instant this webhook was processed (receivedAt), not a time fabricated
      // from bill.paymentDate ('2026-09-18', a date-only field with no time-of-day) — see
      // process-asaas-webhook-service.ts.
      expect(storedTransaction.paidAt).not.toBeNull();
      expect(storedTransaction.paidAt!.getTime()).toBeGreaterThanOrEqual(beforeRequest.getTime());
      expect(storedTransaction.paidAt!.getTime()).toBeLessThanOrEqual(afterRequest.getTime());
    });

    it('never leaks the bank barcode (identificationField) into stored data, even if sent by the caller', async () => {
      const app = buildApp(WEBHOOK_TOKEN);
      const barcode = '03399.77779 29900.000000 04751.101017 1 81510000002990';

      await request(app)
        .post(WEBHOOK_URL)
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(billPaidPayload({ identificationField: barcode }));

      const rows = await appDataSource.query(
        'SELECT raw_payload FROM external_payment_events WHERE provider_resource_id = $1',
        ['bill_e2e_000001'],
      );
      expect(JSON.stringify(rows)).not.toContain('81510000002990');
    });
  });

  describe('idempotency (at-least-once delivery)', () => {
    it('returns 200 for a re-delivered event without applying the business rule twice', async () => {
      const app = buildApp(WEBHOOK_TOKEN);
      const payload = billPaidPayload();

      const first = await request(app)
        .post(WEBHOOK_URL)
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(payload);
      const second = await request(app)
        .post(WEBHOOK_URL)
        .set('asaas-access-token', WEBHOOK_TOKEN)
        .send(payload);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      const events = await appDataSource.query(
        'SELECT count(*)::int AS count FROM external_payment_events WHERE provider_event_id = $1',
        [payload.id],
      );
      expect(events[0].count).toBe(1);

      const storedAttempt = await appDataSource
        .getRepository(PaymentAttemptEntity)
        .findOneOrFail({ where: { id: attempt.id } });
      expect(storedAttempt.status).toBe('confirmed');
    });
  });

  describe('intermediate events', () => {
    it.each(['BILL_CREATED', 'BILL_PENDING', 'BILL_BANK_PROCESSING'])(
      '%s returns 200 without marking the Transaction paid',
      async (event) => {
        const app = buildApp(WEBHOOK_TOKEN);

        const response = await request(app)
          .post(WEBHOOK_URL)
          .set('asaas-access-token', WEBHOOK_TOKEN)
          .send({ ...billPaidPayload(), event });

        expect(response.status).toBe(200);

        const storedTransaction = await appDataSource
          .getRepository(TransactionEntity)
          .findOneOrFail({ where: { id: transaction.id } });
        expect(storedTransaction.status).toBe('pending');
      },
    );
  });
});
