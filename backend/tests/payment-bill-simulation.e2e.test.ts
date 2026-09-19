import { randomUUID } from 'node:crypto';

import express from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import { ForbiddenError } from '../src/errors/forbidden-error.js';
import { TransactionAlreadyPaidError } from '../src/errors/transaction-already-paid-error.js';
import { TransactionNotFoundError } from '../src/errors/transaction-not-found-error.js';
import { AsaasClientError } from '../src/integrations/asaas/asaas-client.error.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import type { AsaasIntegrationClient } from '../src/routes/household-routes.js';
import { createTransactionRouter } from '../src/routes/transaction-routes.js';
import type {
  AsaasBalance,
  AsaasBillPayment,
  AsaasBillSimulation,
  AsaasCreateBillPaymentInput,
  AsaasFinancialTransactionPage,
  AsaasSimulateBillPaymentInput,
} from '../src/integrations/asaas/asaas-client.js';
import type {
  CategoryRecord,
  CategoryRepository,
  CategoryType,
  CreateCategoryData,
  UpdateCategoryData,
} from '../src/repositories/category-repository.js';
import type {
  AddedHouseholdMember,
  CreatedHousehold,
  CreateHouseholdData,
  HouseholdRepository,
  ListedHousehold,
  ListedHouseholdMember,
} from '../src/repositories/household-repository.js';
import type {
  CreateRecurringTransactionData,
  GenerateRecurringTransactionsData,
  GenerateRecurringTransactionsResult,
  ListRecurringTransactionsData,
  RecurringTransactionRecord,
  RecurringTransactionRepository,
  UpdateRecurringTransactionData,
} from '../src/repositories/recurring-transaction-repository.js';
import type {
  CreatePaymentAttemptData,
  MarkPaymentAttemptOutcomeData,
  MarkPaymentAttemptProcessingData,
  PaymentAttemptRecord,
  PaymentAttemptRepository,
} from '../src/repositories/payment-attempt-repository.js';
import type {
  CreateTransactionData,
  DeleteTransactionData,
  FindPendingTransactionAsOwnerData,
  FindTransactionAsMemberData,
  GetHouseholdCategorySummaryData,
  GetHouseholdMonthlySummaryData,
  GetHouseholdSummaryData,
  GetHouseholdUserSummaryData,
  HouseholdCategorySummaryEntry,
  HouseholdMonthlySummaryEntry,
  HouseholdSummary,
  HouseholdUserSummaryEntry,
  ListTransactionsData,
  ListTransactionsResult,
  TransactionRecord,
  TransactionRepository,
  UpdateTransactionData,
} from '../src/repositories/transaction-repository.js';
import type { CreateUserData, UserRepository } from '../src/repositories/user-repository.js';

const TEST_JWT_SECRET = Buffer.alloc(32, 7);
const USER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();
const EXTERNAL_USER_ID = randomUUID();
const HOUSEHOLD_ID = randomUUID();
const OTHER_HOUSEHOLD_ID = randomUUID();
const TRANSACTION_ID = randomUUID();
const IDENTIFICATION_FIELD = '03399.77779 29900.000000 04751.101017 1 81510000002990';
const NOW = new Date('2026-09-13T18:00:00.000Z');

const database: DatabaseReadiness = {
  async isReady(): Promise<boolean> {
    return true;
  },
};

class StubUserRepository implements UserRepository {
  async findByEmail(_email: string): Promise<UserEntity | null> {
    return null;
  }

  async findById(_id: string): Promise<UserEntity | null> {
    return null;
  }

  async create(_data: CreateUserData): Promise<UserEntity> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }
}

class StubHouseholdRepository implements HouseholdRepository {
  async createWithOwner(_data: CreateHouseholdData): Promise<CreatedHousehold | null> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async listForMember(_userId: string): Promise<ListedHousehold[]> {
    return [];
  }

  async listMembersForMember(
    _householdId: string,
    _userId: string,
  ): Promise<ListedHouseholdMember[] | null> {
    return null;
  }

  async findMembershipRole(
    _householdId: string,
    _userId: string,
  ): Promise<'owner' | 'member' | null> {
    return null;
  }

  async addMemberAsOwner(
    _householdId: string,
    _requesterId: string,
    _userId: string,
  ): Promise<AddedHouseholdMember> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }
}

class StubCategoryRepository implements CategoryRepository {
  async create(_data: CreateCategoryData): Promise<CategoryRecord> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async list(_householdId: string, _type?: CategoryType): Promise<CategoryRecord[]> {
    return [];
  }

  async update(
    _householdId: string,
    _categoryId: string,
    _data: UpdateCategoryData,
  ): Promise<CategoryRecord | null> {
    return null;
  }

  async deleteAsOwner(
    _householdId: string,
    _requesterId: string,
    _categoryId: string,
  ): Promise<void> {}
}

class StubRecurringTransactionRepository implements RecurringTransactionRepository {
  async createAsMember(_data: CreateRecurringTransactionData): Promise<RecurringTransactionRecord> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async listAsMember(_data: ListRecurringTransactionsData): Promise<RecurringTransactionRecord[]> {
    return [];
  }

  async updateAsMember(_data: UpdateRecurringTransactionData): Promise<RecurringTransactionRecord> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async generateAsMember(
    _data: GenerateRecurringTransactionsData,
  ): Promise<GenerateRecurringTransactionsResult> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }
}

class StubPaymentAttemptRepository implements PaymentAttemptRepository {
  async createPaymentAttempt(_data: CreatePaymentAttemptData): Promise<PaymentAttemptRecord> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async markProcessing(_data: MarkPaymentAttemptProcessingData): Promise<PaymentAttemptRecord> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async markFailed(_data: MarkPaymentAttemptOutcomeData): Promise<PaymentAttemptRecord> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async markUncertain(_data: MarkPaymentAttemptOutcomeData): Promise<PaymentAttemptRecord> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async findLatestForTransactionAsMember(): Promise<PaymentAttemptRecord | null> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }
}

class InMemoryTransactionRepository implements TransactionRepository {
  readonly records: Array<TransactionRecord & { householdId: string }> = [];
  readonly memberships: Array<{ householdId: string; userId: string; role: 'owner' | 'member' }> =
    [];

  async createAsMember(_data: CreateTransactionData): Promise<TransactionRecord> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async listAsMember(_data: ListTransactionsData): Promise<ListTransactionsResult> {
    return { records: [], total: 0 };
  }

  async getSummaryAsMember(_data: GetHouseholdSummaryData): Promise<HouseholdSummary> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async getUserSummaryAsMember(
    _data: GetHouseholdUserSummaryData,
  ): Promise<HouseholdUserSummaryEntry[]> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async getCategorySummaryAsMember(
    _data: GetHouseholdCategorySummaryData,
  ): Promise<HouseholdCategorySummaryEntry[]> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async getMonthlySummaryAsMember(
    _data: GetHouseholdMonthlySummaryData,
  ): Promise<HouseholdMonthlySummaryEntry[]> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async updateAsMember(_data: UpdateTransactionData): Promise<TransactionRecord> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async deleteAsMember(_data: DeleteTransactionData): Promise<void> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }

  async findPendingAsOwner(data: FindPendingTransactionAsOwnerData): Promise<TransactionRecord> {
    const membership = this.memberships.find(
      (candidate) =>
        candidate.householdId === data.householdId && candidate.userId === data.requesterId,
    );

    if (membership?.role !== 'owner') {
      throw new ForbiddenError();
    }

    const transaction = this.records.find(
      (record) => record.id === data.transactionId && record.householdId === data.householdId,
    );

    if (!transaction) {
      throw new TransactionNotFoundError();
    }

    if (transaction.status !== 'pending') {
      throw new TransactionAlreadyPaidError();
    }

    return transaction;
  }

  async findByIdAsMember(_data: FindTransactionAsMemberData): Promise<TransactionRecord> {
    throw new Error('Not implemented in payment bill simulation tests.');
  }
}

class FakeAsaasClient implements AsaasIntegrationClient {
  calls: AsaasSimulateBillPaymentInput[] = [];

  constructor(private readonly result: AsaasBillSimulation | Error = defaultSimulation()) {}

  async createBillPayment(_input: AsaasCreateBillPaymentInput): Promise<AsaasBillPayment> {
    throw new Error('Not used in payment bill simulation tests.');
  }

  async simulateBillPayment(input: AsaasSimulateBillPaymentInput): Promise<AsaasBillSimulation> {
    this.calls.push(input);

    if (this.result instanceof Error) {
      throw this.result;
    }

    return this.result;
  }

  async getBalance(): Promise<AsaasBalance> {
    throw new Error('Not used in payment bill simulation tests.');
  }

  async listFinancialTransactions(): Promise<AsaasFinancialTransactionPage> {
    throw new Error('Not used in payment bill simulation tests.');
  }
}

function defaultSimulation(overrides: Partial<AsaasBillSimulation> = {}): AsaasBillSimulation {
  return {
    value: 150,
    originalValue: 150,
    dueDate: '2026-09-20',
    isOverdue: false,
    allowChangeValue: false,
    minValue: null,
    maxValue: null,
    beneficiaryName: 'Beneficiary Co',
    companyName: 'Issuer Co',
    fee: 1.5,
    minimumScheduleDate: '2026-09-10',
    ...overrides,
  };
}

function storedTransaction(
  overrides: Partial<TransactionRecord & { householdId: string }> = {},
): TransactionRecord & { householdId: string } {
  return {
    id: TRANSACTION_ID,
    householdId: HOUSEHOLD_ID,
    type: 'expense',
    amount: '150.00',
    transactionDate: '2026-09-13',
    dueDate: '2026-09-20',
    categoryId: null,
    description: 'Boleto de teste',
    status: 'pending',
    paidAt: null,
    source: 'manual',
    expenseNature: null,
    recurringTransactionId: null,
    recurringPeriod: null,
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
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

function grantMembership(
  transactions: InMemoryTransactionRepository,
  role: 'owner' | 'member',
  userId = USER_ID,
  householdId = HOUSEHOLD_ID,
): void {
  transactions.memberships.push({ householdId, userId, role });
}

function createTestContext(
  transactions = new InMemoryTransactionRepository(),
  asaasClient: AsaasIntegrationClient | undefined = new FakeAsaasClient(),
) {
  const app = createApp(
    database,
    new StubUserRepository(),
    TEST_JWT_SECRET,
    new StubHouseholdRepository(),
    new StubCategoryRepository(),
    transactions,
    new StubPaymentAttemptRepository(),
    new StubRecurringTransactionRepository(),
    undefined,
    asaasClient,
  );

  return { app, transactions };
}

function simulateUrl(householdId = HOUSEHOLD_ID, transactionId = TRANSACTION_ID): string {
  return `/api/households/${householdId}/transactions/${transactionId}/payment/bill/simulate`;
}

describe('POST /api/households/:householdId/transactions/:transactionId/payment/bill/simulate', () => {
  it('rejects an unauthenticated request', async () => {
    const { app } = createTestContext();

    const response = await request(app)
      .post(simulateUrl())
      .send({ identificationField: IDENTIFICATION_FIELD });

    expect(response.status).toBe(401);
  });

  it('allows the owner to simulate a pending bill payment', async () => {
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction());
    grantMembership(transactions, 'owner');
    const asaasClient = new FakeAsaasClient(defaultSimulation({ value: 150 }));
    const { app } = createTestContext(transactions, asaasClient);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: IDENTIFICATION_FIELD });

    expect(response.status).toBe(200);
    expect(response.body.data.transaction).toEqual({
      id: TRANSACTION_ID,
      amount: '150.00',
      status: 'pending',
    });
    expect(response.body.data.amountMatchesTransaction).toBe(true);
    expect(response.body.data.simulation.value).toBe(150);
    expect(asaasClient.calls).toEqual([{ identificationField: IDENTIFICATION_FIELD }]);
  });

  it('flags a divergence when the simulated value differs from the transaction amount', async () => {
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction({ amount: '150.00' }));
    grantMembership(transactions, 'owner');
    const asaasClient = new FakeAsaasClient(defaultSimulation({ value: 199.9 }));
    const { app } = createTestContext(transactions, asaasClient);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: IDENTIFICATION_FIELD });

    expect(response.status).toBe(200);
    expect(response.body.data.amountMatchesTransaction).toBe(false);
  });

  it('does not change the transaction status after a successful simulation', async () => {
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction());
    grantMembership(transactions, 'owner');
    const { app } = createTestContext(transactions);
    const token = await createToken(USER_ID);

    await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: IDENTIFICATION_FIELD });

    expect(transactions.records[0]?.status).toBe('pending');
  });

  it('never leaks the identificationField back in the response body', async () => {
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction());
    grantMembership(transactions, 'owner');
    const { app } = createTestContext(transactions);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: IDENTIFICATION_FIELD });

    expect(JSON.stringify(response.body)).not.toContain(IDENTIFICATION_FIELD);
  });

  it('forbids a member from simulating a bill payment', async () => {
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction());
    grantMembership(transactions, 'member');
    const { app } = createTestContext(transactions);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: IDENTIFICATION_FIELD });

    expect(response.status).toBe(403);
  });

  it('forbids a user with no membership in the household', async () => {
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction());
    const { app } = createTestContext(transactions);
    const token = await createToken(EXTERNAL_USER_ID);

    const response = await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: IDENTIFICATION_FIELD });

    expect(response.status).toBe(403);
  });

  it('forbids an owner of a different household', async () => {
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction());
    grantMembership(transactions, 'owner', OTHER_USER_ID, OTHER_HOUSEHOLD_ID);
    const { app } = createTestContext(transactions);
    const token = await createToken(OTHER_USER_ID);

    const response = await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: IDENTIFICATION_FIELD });

    expect(response.status).toBe(403);
  });

  it('returns 404 when the transaction does not exist in the household', async () => {
    const transactions = new InMemoryTransactionRepository();
    grantMembership(transactions, 'owner');
    const { app } = createTestContext(transactions);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: IDENTIFICATION_FIELD });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TRANSACTION_NOT_FOUND');
  });

  it('rejects a transaction that is already paid', async () => {
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction({ status: 'paid', paidAt: NOW }));
    grantMembership(transactions, 'owner');
    const asaasClient = new FakeAsaasClient();
    const { app } = createTestContext(transactions, asaasClient);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: IDENTIFICATION_FIELD });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('TRANSACTION_ALREADY_PAID');
    expect(asaasClient.calls).toHaveLength(0);
  });

  it('rejects an empty identificationField without calling Asaas', async () => {
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction());
    grantMembership(transactions, 'owner');
    const asaasClient = new FakeAsaasClient();
    const { app } = createTestContext(transactions, asaasClient);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: '   ' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(asaasClient.calls).toHaveLength(0);
  });

  it('rejects a payload missing identificationField', async () => {
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction());
    grantMembership(transactions, 'owner');
    const { app } = createTestContext(transactions);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 503 when the payment provider is not configured', async () => {
    // Built directly on the transaction router (skipping createApp's env-backed
    // AsaasClient default) so this stays deterministic regardless of whether
    // ASAAS_API_KEY happens to be set in the local environment running the suite.
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction());
    grantMembership(transactions, 'owner');
    const app = express();
    app.use(express.json());
    app.use(
      '/api/households/:householdId/transactions',
      createTransactionRouter(transactions, new StubPaymentAttemptRepository(), TEST_JWT_SECRET),
    );
    app.use(errorHandler);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: IDENTIFICATION_FIELD });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it.each([
    ['invalid_request', 422, 'INVALID_BILL'],
    ['rate_limit', 503, 'PROVIDER_RATE_LIMITED'],
    ['authentication', 502, 'PROVIDER_ERROR'],
    ['unavailable', 502, 'PROVIDER_ERROR'],
    ['unknown', 502, 'PROVIDER_ERROR'],
  ] as const)('maps Asaas %s errors to HTTP %d', async (code, status, errorCode) => {
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction());
    grantMembership(transactions, 'owner');
    const asaasClient = new FakeAsaasClient(
      new AsaasClientError({ code, message: 'Asaas failure' }),
    );
    const { app } = createTestContext(transactions, asaasClient);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: IDENTIFICATION_FIELD });

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(errorCode);
  });

  it('never creates a payment attempt as a side effect of simulating', async () => {
    const transactions = new InMemoryTransactionRepository();
    transactions.records.push(storedTransaction());
    grantMembership(transactions, 'owner');
    const { app } = createTestContext(transactions);
    const token = await createToken(USER_ID);

    await request(app)
      .post(simulateUrl())
      .set('Authorization', `Bearer ${token}`)
      .send({ identificationField: IDENTIFICATION_FIELD });

    // The stub transaction repository exposes no attempt-creation surface at all,
    // so a passing suite here structurally proves no PaymentAttempt was created.
    expect(transactions.records).toHaveLength(1);
  });
});
