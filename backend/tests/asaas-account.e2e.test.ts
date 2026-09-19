import { randomUUID } from 'node:crypto';

import express from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';

import { appDataSource } from '../src/database/data-source.js';
import { HouseholdMemberEntity } from '../src/database/entities/household-member.entity.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import { AsaasClientError } from '../src/integrations/asaas/asaas-client.error.js';
import type {
  AsaasBalance,
  AsaasFinancialTransactionPage,
  AsaasListFinancialTransactionsOptions,
} from '../src/integrations/asaas/asaas-client.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { TypeOrmHouseholdRepository } from '../src/repositories/household-repository.js';
import type { AsaasAccountClient } from '../src/routes/asaas-account-routes.js';
import { createAsaasAccountRouter } from '../src/routes/asaas-account-routes.js';

const TEST_JWT_SECRET = Buffer.alloc(32, 17);

class FakeAsaasAccountClient implements AsaasAccountClient {
  financialTransactionsCalls: (AsaasListFinancialTransactionsOptions | undefined)[] = [];

  constructor(
    private readonly balanceResult: AsaasBalance | Error = { balance: 1234.56 },
    private readonly pageResult: AsaasFinancialTransactionPage | Error = defaultPage(),
  ) {}

  async getBalance(): Promise<AsaasBalance> {
    if (this.balanceResult instanceof Error) {
      throw this.balanceResult;
    }

    return this.balanceResult;
  }

  async listFinancialTransactions(
    options?: AsaasListFinancialTransactionsOptions,
  ): Promise<AsaasFinancialTransactionPage> {
    this.financialTransactionsCalls.push(options);

    if (this.pageResult instanceof Error) {
      throw this.pageResult;
    }

    return this.pageResult;
  }
}

function defaultPage(
  overrides: Partial<AsaasFinancialTransactionPage> = {},
): AsaasFinancialTransactionPage {
  return {
    data: [
      {
        id: 'ftr_000001',
        value: -50.5,
        type: 'PAYMENT',
        date: '2026-09-18',
        balance: 1184.06,
        description: 'Pagamento de boleto',
        paymentId: 'pay_000001',
        transferId: null,
        billId: 'bill_000001',
      },
    ],
    totalCount: 1,
    hasMore: false,
    offset: 0,
    limit: 20,
    ...overrides,
  };
}

async function createToken(userId: string): Promise<string> {
  return new SignJWT({ email: 'member@example.com' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(TEST_JWT_SECRET);
}

function balanceUrl(householdId: string): string {
  return `/api/households/${householdId}/integrations/asaas/balance`;
}

function financialTransactionsUrl(householdId: string, query = ''): string {
  return `/api/households/${householdId}/integrations/asaas/financial-transactions${query}`;
}

function buildApp(asaasClient?: AsaasAccountClient) {
  const households = new TypeOrmHouseholdRepository(appDataSource);
  const app = express();
  app.use(express.json());
  app.use(
    '/api/households/:householdId/integrations/asaas',
    createAsaasAccountRouter(households, TEST_JWT_SECRET, asaasClient),
  );
  app.use(errorHandler);
  return app;
}

describe('GET /api/households/:householdId/integrations/asaas', () => {
  let owner: UserEntity;
  let outsider: UserEntity;
  let household: HouseholdEntity;

  beforeAll(async () => {
    await appDataSource.initialize();
  });

  afterAll(async () => {
    await appDataSource.destroy();
  });

  beforeEach(async () => {
    owner = await appDataSource.manager.save(
      appDataSource.manager.create(UserEntity, {
        email: `asaas-account-owner-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Owner',
      }),
    );
    outsider = await appDataSource.manager.save(
      appDataSource.manager.create(UserEntity, {
        email: `asaas-account-outsider-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        name: 'Outsider',
      }),
    );

    household = await appDataSource.manager.save(
      appDataSource.manager.create(HouseholdEntity, {
        name: 'Asaas Account Household',
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
  });

  afterEach(async () => {
    await appDataSource.manager.delete(HouseholdEntity, { id: household.id });
    await appDataSource.manager.delete(UserEntity, { id: owner.id });
    await appDataSource.manager.delete(UserEntity, { id: outsider.id });
  });

  describe('GET /balance', () => {
    it('returns 503 when the provider is not configured', async () => {
      const app = buildApp(undefined);
      const token = await createToken(owner.id);

      const response = await request(app)
        .get(balanceUrl(household.id))
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('PROVIDER_NOT_CONFIGURED');
    });

    it('returns the balance for a household member', async () => {
      const app = buildApp(new FakeAsaasAccountClient({ balance: 987.65 }));
      const token = await createToken(owner.id);

      const response = await request(app)
        .get(balanceUrl(household.id))
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({ balance: 987.65 });
    });

    it('rejects a user outside the household', async () => {
      const app = buildApp(new FakeAsaasAccountClient());
      const token = await createToken(outsider.id);

      const response = await request(app)
        .get(balanceUrl(household.id))
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it('maps a provider outage to a safe 502 response', async () => {
      const app = buildApp(
        new FakeAsaasAccountClient(new AsaasClientError({ code: 'unavailable', message: 'boom' })),
      );
      const token = await createToken(owner.id);

      const response = await request(app)
        .get(balanceUrl(household.id))
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe('PROVIDER_ERROR');
    });
  });

  describe('GET /financial-transactions', () => {
    it('returns the sanitized transaction list for a household member', async () => {
      const app = buildApp(new FakeAsaasAccountClient());
      const token = await createToken(owner.id);

      const response = await request(app)
        .get(financialTransactionsUrl(household.id))
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual({
        transactions: [
          {
            id: 'ftr_000001',
            value: -50.5,
            type: 'PAYMENT',
            date: '2026-09-18',
            balance: 1184.06,
            description: 'Pagamento de boleto',
          },
        ],
        totalCount: 1,
        hasMore: false,
        offset: 0,
        limit: 20,
      });
      expect(JSON.stringify(response.body)).not.toContain('paymentId');
      expect(JSON.stringify(response.body)).not.toContain('billId');
    });

    it('returns an empty list without treating it as an error', async () => {
      const app = buildApp(
        new FakeAsaasAccountClient(undefined, {
          data: [],
          totalCount: 0,
          hasMore: false,
          offset: 0,
          limit: 20,
        }),
      );
      const token = await createToken(owner.id);

      const response = await request(app)
        .get(financialTransactionsUrl(household.id))
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.transactions).toEqual([]);
    });

    it('forwards validated query parameters to the provider client', async () => {
      const client = new FakeAsaasAccountClient();
      const app = buildApp(client);
      const token = await createToken(owner.id);

      const response = await request(app)
        .get(
          financialTransactionsUrl(
            household.id,
            '?offset=10&limit=5&startDate=2026-09-01&finishDate=2026-09-30&order=desc',
          ),
        )
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(client.financialTransactionsCalls).toEqual([
        {
          offset: 10,
          limit: 5,
          startDate: '2026-09-01',
          finishDate: '2026-09-30',
          order: 'desc',
        },
      ]);
    });

    it('rejects an invalid query parameter', async () => {
      const app = buildApp(new FakeAsaasAccountClient());
      const token = await createToken(owner.id);

      const response = await request(app)
        .get(financialTransactionsUrl(household.id, '?limit=0'))
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a user outside the household', async () => {
      const app = buildApp(new FakeAsaasAccountClient());
      const token = await createToken(outsider.id);

      const response = await request(app)
        .get(financialTransactionsUrl(household.id))
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });
});
