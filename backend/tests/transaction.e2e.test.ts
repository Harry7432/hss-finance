import { randomUUID } from 'node:crypto';

import { jest } from '@jest/globals';
import type { Express } from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import type { DataSource, EntityManager } from 'typeorm';

import { createApp } from '../src/app.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';
import { CategoryEntity } from '../src/database/entities/category.entity.js';
import { HouseholdMemberEntity } from '../src/database/entities/household-member.entity.js';
import { TransactionEntity } from '../src/database/entities/transaction.entity.js';
import { ForbiddenError } from '../src/errors/forbidden-error.js';
import { InvalidCategoryError } from '../src/errors/invalid-category-error.js';
import { TransactionNotFoundError } from '../src/errors/transaction-not-found-error.js';
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
import {
  TypeOrmTransactionRepository,
  type CreateTransactionData,
  type DeleteTransactionData,
  type ListTransactionsData,
  type ListTransactionsResult,
  type TransactionRecord,
  type TransactionRepository,
  type TransactionStatus,
  type UpdateTransactionData,
} from '../src/repositories/transaction-repository.js';
import type { CreateUserData, UserRepository } from '../src/repositories/user-repository.js';
import { UserEntity } from '../src/database/entities/user.entity.js';

const TEST_JWT_SECRET = Buffer.alloc(32, 3);
const USER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();
const HOUSEHOLD_ID = randomUUID();
const OTHER_HOUSEHOLD_ID = randomUUID();
const EXPENSE_CATEGORY_ID = randomUUID();
const INCOME_CATEGORY_ID = randomUUID();
const CROSS_HOUSEHOLD_CATEGORY_ID = randomUUID();
const NOW = new Date('2026-09-13T18:00:00.000Z');
const TODAY = '2026-09-13';
const database: DatabaseReadiness = {
  async isReady(): Promise<boolean> {
    return true;
  },
};

interface StoredTransaction extends TransactionRecord {
  householdId: string;
  externalId: null;
}

class StubUserRepository implements UserRepository {
  async findByEmail(_email: string): Promise<UserEntity | null> {
    return null;
  }

  async findById(_id: string): Promise<UserEntity | null> {
    return null;
  }

  async create(_data: CreateUserData): Promise<UserEntity> {
    throw new Error('Not implemented in transaction tests.');
  }
}

class StubHouseholdRepository implements HouseholdRepository {
  async createWithOwner(_data: CreateHouseholdData): Promise<CreatedHousehold | null> {
    throw new Error('Not implemented in transaction tests.');
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
    throw new Error('Not implemented in transaction tests.');
  }
}

class StubCategoryRepository implements CategoryRepository {
  async create(_data: CreateCategoryData): Promise<CategoryRecord> {
    throw new Error('Not implemented in transaction tests.');
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

class InMemoryTransactionRepository implements TransactionRepository {
  readonly records: StoredTransaction[] = [];
  readonly createCalls: CreateTransactionData[] = [];
  readonly deleteCalls: DeleteTransactionData[] = [];
  readonly listCalls: ListTransactionsData[] = [];
  readonly updateCalls: UpdateTransactionData[] = [];
  readonly memberships: Array<{
    householdId: string;
    userId: string;
    role: 'owner' | 'member';
  }> = [];
  readonly categories = [
    { id: EXPENSE_CATEGORY_ID, householdId: HOUSEHOLD_ID, type: 'expense' as const },
    { id: INCOME_CATEGORY_ID, householdId: HOUSEHOLD_ID, type: 'income' as const },
    {
      id: CROSS_HOUSEHOLD_CATEGORY_ID,
      householdId: OTHER_HOUSEHOLD_ID,
      type: 'expense' as const,
    },
  ];

  constructor(
    private readonly createError?: Error,
    private readonly listError?: Error,
    private readonly updateError?: Error,
    private readonly deleteError?: Error,
  ) {}

  async createAsMember(data: CreateTransactionData): Promise<TransactionRecord> {
    this.createCalls.push(data);

    if (this.createError) {
      throw this.createError;
    }

    const membership = this.memberships.find(
      (candidate) =>
        candidate.householdId === data.householdId && candidate.userId === data.requesterId,
    );

    if (!membership) {
      throw new ForbiddenError();
    }

    if (data.categoryId !== null) {
      const category = this.categories.find(
        (candidate) =>
          candidate.id === data.categoryId && candidate.householdId === data.householdId,
      );

      if (!category || category.type !== data.type) {
        throw new InvalidCategoryError();
      }
    }

    const record: StoredTransaction = {
      id: randomUUID(),
      householdId: data.householdId,
      type: data.type,
      amount: data.amount,
      transactionDate: data.transactionDate,
      dueDate: data.dueDate,
      categoryId: data.categoryId,
      description: data.description,
      status: data.status,
      paidAt: data.paidAt,
      source: 'manual',
      externalId: null,
      createdBy: data.requesterId,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.records.push(record);
    return record;
  }

  async listAsMember(data: ListTransactionsData): Promise<ListTransactionsResult> {
    this.listCalls.push(data);

    if (this.listError) {
      throw this.listError;
    }

    const membership = this.memberships.find(
      (candidate) =>
        candidate.householdId === data.householdId && candidate.userId === data.requesterId,
    );

    if (!membership) {
      throw new ForbiddenError();
    }

    const filtered = this.records
      .filter((record) => record.householdId === data.householdId)
      .filter((record) => data.type === undefined || record.type === data.type)
      .filter((record) => data.status === undefined || record.status === data.status)
      .filter(
        (record) =>
          data.state === undefined ||
          (record.status === 'pending' &&
            (data.state === 'overdue'
              ? record.dueDate !== null && record.dueDate < data.today
              : record.dueDate === null || record.dueDate >= data.today)),
      )
      .filter((record) => data.categoryId === undefined || record.categoryId === data.categoryId)
      .filter((record) => data.createdBy === undefined || record.createdBy === data.createdBy)
      .filter((record) => data.startDate === undefined || record.transactionDate >= data.startDate)
      .filter((record) => data.endDate === undefined || record.transactionDate <= data.endDate)
      .sort(
        (left, right) =>
          right.transactionDate.localeCompare(left.transactionDate) ||
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id),
      );
    const offset = (data.page - 1) * data.limit;

    return {
      records: filtered.slice(offset, offset + data.limit),
      total: filtered.length,
    };
  }

  async updateAsMember(data: UpdateTransactionData): Promise<TransactionRecord> {
    this.updateCalls.push(data);

    if (this.updateError) {
      throw this.updateError;
    }

    const membership = this.memberships.find(
      (candidate) =>
        candidate.householdId === data.householdId && candidate.userId === data.requesterId,
    );

    if (!membership) {
      throw new ForbiddenError();
    }

    const index = this.records.findIndex(
      (record) => record.id === data.transactionId && record.householdId === data.householdId,
    );

    const current = this.records[index];

    if (index === -1 || current === undefined) {
      throw new TransactionNotFoundError();
    }

    if (membership.role === 'member' && current.createdBy !== data.requesterId) {
      throw new ForbiddenError();
    }

    const finalType = data.type ?? current.type;
    const finalAmount = data.amount ?? current.amount;
    const finalTransactionDate = data.transactionDate ?? current.transactionDate;
    const finalDueDate = data.dueDate !== undefined ? data.dueDate : current.dueDate;
    const finalDescription =
      data.description !== undefined ? data.description : current.description;

    let finalCategoryId: string | null;
    let finalStatus: TransactionStatus;
    let finalPaidAt: Date | null;

    if (data.categoryId !== undefined && data.categoryId !== null) {
      const category = this.categories.find(
        (candidate) =>
          candidate.id === data.categoryId && candidate.householdId === data.householdId,
      );

      if (!category || category.type !== finalType) {
        throw new InvalidCategoryError();
      }

      finalCategoryId = data.categoryId;
    } else if (data.categoryId === null) {
      finalCategoryId = null;
    } else {
      finalCategoryId = current.categoryId;

      if (finalCategoryId !== null) {
        const category = this.categories.find(
          (candidate) =>
            candidate.id === finalCategoryId && candidate.householdId === data.householdId,
        );

        if (!category || category.type !== finalType) {
          throw new InvalidCategoryError();
        }
      }
    }

    if (data.status === undefined) {
      finalStatus = current.status;
      finalPaidAt = current.paidAt;
    } else if (data.status === 'paid') {
      finalStatus = 'paid';
      finalPaidAt = current.status === 'paid' ? current.paidAt : new Date();
    } else {
      finalStatus = 'pending';
      finalPaidAt = null;
    }

    const updated: StoredTransaction = {
      ...current,
      type: finalType,
      amount: finalAmount,
      transactionDate: finalTransactionDate,
      dueDate: finalDueDate,
      categoryId: finalCategoryId,
      description: finalDescription,
      status: finalStatus,
      paidAt: finalPaidAt,
      updatedAt: new Date(),
    };
    this.records[index] = updated;
    return updated;
  }

  async deleteAsMember(data: DeleteTransactionData): Promise<void> {
    this.deleteCalls.push(data);

    if (this.deleteError) {
      throw this.deleteError;
    }

    const membership = this.memberships.find(
      (candidate) =>
        candidate.householdId === data.householdId && candidate.userId === data.requesterId,
    );

    if (!membership) {
      throw new ForbiddenError();
    }

    const index = this.records.findIndex(
      (record) => record.id === data.transactionId && record.householdId === data.householdId,
    );
    const transaction = this.records[index];

    if (index === -1 || transaction === undefined) {
      throw new TransactionNotFoundError();
    }

    if (membership.role === 'member' && transaction.createdBy !== data.requesterId) {
      throw new ForbiddenError();
    }

    this.records.splice(index, 1);
  }
}

async function createToken(userId: string): Promise<string> {
  return new SignJWT({ email: 'member@example.com' })
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
  todayProvider = (): string => TODAY,
) {
  const app = createApp(
    database,
    new StubUserRepository(),
    TEST_JWT_SECRET,
    new StubHouseholdRepository(),
    new StubCategoryRepository(),
    transactions,
    todayProvider,
  );

  return { app, transactions };
}

function validPayload(type: 'income' | 'expense' = 'expense') {
  return {
    type,
    amount: '150.90',
    transactionDate: '2026-09-13',
    dueDate: '2026-09-20',
    categoryId: type === 'expense' ? EXPENSE_CATEGORY_ID : INCOME_CATEGORY_ID,
    description: 'Mercado',
    status: 'pending',
  };
}

function storedTransaction(overrides: Partial<StoredTransaction> = {}): StoredTransaction {
  return {
    id: randomUUID(),
    householdId: HOUSEHOLD_ID,
    type: 'expense',
    amount: '25.00',
    transactionDate: '2026-09-13',
    dueDate: null,
    categoryId: EXPENSE_CATEGORY_ID,
    description: 'Test transaction',
    status: 'pending',
    paidAt: null,
    source: 'manual',
    externalId: null,
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('POST /api/households/:householdId/transactions', () => {
  it.each([
    ['owner', 'expense'],
    ['member', 'expense'],
    ['owner', 'income'],
    ['member', 'income'],
  ] as const)('allows a %s to create a pending %s', async (role, type) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, role);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload(type));

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        id: expect.any(String),
        type,
        amount: '150.90',
        transactionDate: '2026-09-13',
        dueDate: '2026-09-20',
        categoryId: type === 'expense' ? EXPENSE_CATEGORY_ID : INCOME_CATEGORY_ID,
        description: 'Mercado',
        status: 'pending',
        paidAt: null,
        source: 'manual',
        createdBy: USER_ID,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    });
    expect(transactions.records[0]).toMatchObject({
      householdId: HOUSEHOLD_ID,
      createdBy: USER_ID,
      source: 'manual',
      externalId: null,
    });
    expect(response.body.data).not.toHaveProperty('household');
    expect(response.body.data).not.toHaveProperty('category');
    expect(response.body.data).not.toHaveProperty('user');
    expect(response.body.data).not.toHaveProperty('externalId');
  });

  it('defaults omitted status to pending with a null paidAt', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);
    const payload = validPayload();
    const { status: _status, ...withoutStatus } = payload;

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send(withoutStatus);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'pending', paidAt: null });
    expect(transactions.records[0]?.paidAt).toBeNull();
  });

  it('sets paidAt internally when a transaction is created as paid', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const token = await createToken(USER_ID);

    const beforeRequest = Date.now();
    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload(), status: 'paid' });
    const afterRequest = Date.now();

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('paid');
    expect(Date.parse(response.body.data.paidAt)).toBeGreaterThanOrEqual(beforeRequest);
    expect(Date.parse(response.body.data.paidAt)).toBeLessThanOrEqual(afterRequest);
    expect(transactions.createCalls[0]?.paidAt).toBeInstanceOf(Date);
  });

  it('defaults omitted nullable fields to null', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'expense', amount: '10', transactionDate: '2026-02-28' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      amount: '10.00',
      dueDate: null,
      categoryId: null,
      description: null,
    });
  });

  it('allows nullable fields to be explicitly null', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'expense',
        amount: '10.00',
        transactionDate: '2026-02-28',
        dueDate: null,
        categoryId: null,
        description: null,
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      dueDate: null,
      categoryId: null,
      description: null,
    });
  });

  it('normalizes an empty trimmed description to null', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload(), description: '   ' });

    expect(response.status).toBe(201);
    expect(response.body.data.description).toBeNull();
  });

  it.each([
    ['10', '10.00'],
    ['10.5', '10.50'],
    ['1.00', '1.00'],
    ['999999999999.99', '999999999999.99'],
  ])('accepts and normalizes amount %s to %s', async (amount, normalized) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload(), amount });

    expect(response.status).toBe(201);
    expect(response.body.data.amount).toBe(normalized);
    expect(transactions.createCalls[0]?.amount).toBe(normalized);
  });

  it.each([
    ['a category from another household', CROSS_HOUSEHOLD_CATEGORY_ID],
    ['a nonexistent category', randomUUID()],
    ['a category with a different type', INCOME_CATEGORY_ID],
  ])('returns the same INVALID_CATEGORY response for %s', async (_caseName, categoryId) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload(), categoryId });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'INVALID_CATEGORY', message: 'Invalid category' },
    });
    expect(transactions.records).toHaveLength(0);
  });

  it.each([
    ['a nonexistent household', randomUUID(), USER_ID],
    ['a user without membership', HOUSEHOLD_ID, USER_ID],
    ['the household creator without membership', HOUSEHOLD_ID, OTHER_USER_ID],
  ])(
    'returns 403 without revealing whether the household exists for %s',
    async (_case, id, userId) => {
      const { app, transactions } = createTestContext();
      const token = await createToken(userId);

      const response = await request(app)
        .post(`/api/households/${id}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send(validPayload());

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
      expect(transactions.records).toHaveLength(0);
    },
  );

  it('returns 401 without a token', async () => {
    const { app } = createTestContext();

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .send(validPayload());

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 for an invalid household UUID', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post('/api/households/not-a-uuid/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload());

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['missing type', { amount: '10.00', transactionDate: '2026-09-13' }],
    ['missing amount', { type: 'expense', transactionDate: '2026-09-13' }],
    ['missing transaction date', { type: 'expense', amount: '10.00' }],
    ['invalid category UUID', { ...validPayload(), categoryId: 'invalid' }],
    ['invalid type', { ...validPayload(), type: 'transfer' }],
    ['invalid status', { ...validPayload(), status: 'overdue' }],
    ['numeric amount', { ...validPayload(), amount: 10.5 }],
    ['zero amount', { ...validPayload(), amount: '0' }],
    ['zero decimal amount', { ...validPayload(), amount: '0.00' }],
    ['negative amount', { ...validPayload(), amount: '-1' }],
    ['alphabetic amount', { ...validPayload(), amount: 'abc' }],
    ['comma amount', { ...validPayload(), amount: '10,50' }],
    ['exponential amount', { ...validPayload(), amount: '1e3' }],
    ['Infinity amount', { ...validPayload(), amount: 'Infinity' }],
    ['NaN amount', { ...validPayload(), amount: 'NaN' }],
    ['amount above precision', { ...validPayload(), amount: '1000000000000.00' }],
    ['amount above scale', { ...validPayload(), amount: '10.123' }],
    ['invalid transaction date format', { ...validPayload(), transactionDate: '13-09-2026' }],
    ['impossible transaction date', { ...validPayload(), transactionDate: '2026-02-30' }],
    ['year zero transaction date', { ...validPayload(), transactionDate: '0000-01-01' }],
    ['invalid due date', { ...validPayload(), dueDate: '2026-13-01' }],
    ['year zero due date', { ...validPayload(), dueDate: '0000-01-01' }],
    ['description above schema limit', { ...validPayload(), description: 'a'.repeat(256) }],
    ['extra field', { ...validPayload(), extra: true }],
    ['source', { ...validPayload(), source: 'bank_import' }],
    ['externalId', { ...validPayload(), externalId: 'external' }],
    ['external_id', { ...validPayload(), external_id: 'external' }],
    ['paidAt', { ...validPayload(), paidAt: NOW.toISOString() }],
    ['createdBy', { ...validPayload(), createdBy: OTHER_USER_ID }],
    ['created_by', { ...validPayload(), created_by: OTHER_USER_ID }],
    ['householdId', { ...validPayload(), householdId: OTHER_HOUSEHOLD_ID }],
    ['userId', { ...validPayload(), userId: OTHER_USER_ID }],
    ['id', { ...validPayload(), id: randomUUID() }],
    ['createdAt timestamp', { ...validPayload(), createdAt: NOW.toISOString() }],
    ['updatedAt timestamp', { ...validPayload(), updatedAt: NOW.toISOString() }],
  ])('returns 400 and performs no insert for %s in the payload', async (_caseName, payload) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
    });
    expect(transactions.createCalls).toHaveLength(0);
    expect(transactions.records).toHaveLength(0);
  });

  it('uses only the URL household and JWT subject as identity', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions?userId=${OTHER_USER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload());

    expect(response.status).toBe(201);
    expect(transactions.createCalls[0]).toMatchObject({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
    });
  });

  it('returns a sanitized 500 for an unexpected error', async () => {
    const transactions = new InMemoryTransactionRepository(
      new Error('sensitive transaction database details'),
    );
    const { app } = createTestContext(transactions);
    grantMembership(transactions, 'owner');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive transaction database details');
  });
});

describe('GET /api/households/:householdId/transactions', () => {
  it.each(['owner', 'member'] as const)(
    'allows an authenticated %s to list transactions',
    async (role) => {
      const { app, transactions } = createTestContext();
      grantMembership(transactions, role);
      transactions.records.push(storedTransaction());
      const token = await createToken(USER_ID);

      const response = await request(app)
        .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: [
          {
            id: expect.any(String),
            type: 'expense',
            amount: '25.00',
            transactionDate: '2026-09-13',
            dueDate: null,
            categoryId: EXPENSE_CATEGORY_ID,
            description: 'Test transaction',
            status: 'pending',
            paidAt: null,
            source: 'manual',
            createdBy: USER_ID,
            createdAt: NOW.toISOString(),
            updatedAt: NOW.toISOString(),
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
      expect(response.body.data[0]).not.toHaveProperty('household');
      expect(response.body.data[0]).not.toHaveProperty('category');
      expect(response.body.data[0]).not.toHaveProperty('user');
      expect(response.body.data[0]).not.toHaveProperty('externalId');
    },
  );

  it('returns an empty page with zero total pages', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it.each([
    ['a nonexistent household', randomUUID(), USER_ID, undefined],
    ['a user without membership', HOUSEHOLD_ID, OTHER_USER_ID, undefined],
    ['a transaction creator without membership', HOUSEHOLD_ID, OTHER_USER_ID, USER_ID],
  ] as const)(
    'returns the same 403 without revealing household or membership state for %s',
    async (_caseName, householdId, userId, createdBy) => {
      const { app, transactions } = createTestContext();
      transactions.records.push(storedTransaction());
      const token = await createToken(userId);

      const response = await request(app)
        .get(`/api/households/${householdId}/transactions`)
        .query({ state: 'pending', ...(createdBy === undefined ? {} : { createdBy }) })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    },
  );

  it.each(['owner', 'member'] as const)(
    'never returns another household records to a %s',
    async (role) => {
      const { app, transactions } = createTestContext();
      grantMembership(transactions, role);
      const included = storedTransaction();
      const excluded = storedTransaction({ householdId: OTHER_HOUSEHOLD_ID });
      transactions.records.push(included, excluded);
      const token = await createToken(USER_ID);

      const response = await request(app)
        .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
        .query({ state: 'pending' })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([included.id]);
      expect(transactions.listCalls[0]).toMatchObject({ householdId: HOUSEHOLD_ID });
    },
  );

  it.each([
    ['type', 'income', { type: 'income' }],
    ['type', 'expense', { type: 'expense' }],
    ['status', 'pending', { status: 'pending' }],
    ['status', 'paid', { status: 'paid', paidAt: NOW }],
  ] as const)('filters by valid %s=%s', async (key, value, matchingOverrides) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const matching = storedTransaction(matchingOverrides);
    const other = storedTransaction(
      key === 'type'
        ? { type: value === 'income' ? 'expense' : 'income' }
        : { status: value === 'paid' ? 'pending' : 'paid', paidAt: value === 'paid' ? null : NOW },
    );
    transactions.records.push(matching, other);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ [key]: value })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([matching.id]);
    expect(transactions.listCalls[0]).toMatchObject({ [key]: value });
  });

  it('classifies pending transactions from dueDate without exposing a derived field', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const withoutDueDate = storedTransaction({ dueDate: null });
    const dueToday = storedTransaction({ dueDate: TODAY });
    const future = storedTransaction({ dueDate: '2026-09-14' });
    const overdue = storedTransaction({ dueDate: '2026-09-12' });
    const paid = storedTransaction({ status: 'paid', dueDate: '2026-09-14', paidAt: NOW });
    transactions.records.push(withoutDueDate, dueToday, future, overdue, paid);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ state: 'pending' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(new Set(response.body.data.map((record: { id: string }) => record.id))).toEqual(
      new Set([withoutDueDate.id, dueToday.id, future.id]),
    );
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data[0]).not.toHaveProperty('state');
    expect(transactions.listCalls[0]).toMatchObject({ state: 'pending', today: TODAY });
  });

  it('classifies overdue transactions and excludes every non-overdue case', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const overdue = storedTransaction({ dueDate: '2026-09-12' });
    const dueToday = storedTransaction({ dueDate: TODAY });
    const future = storedTransaction({ dueDate: '2026-09-14' });
    const withoutDueDate = storedTransaction({ dueDate: null });
    const paidOverdue = storedTransaction({ status: 'paid', dueDate: '2026-09-12', paidAt: NOW });
    transactions.records.push(overdue, dueToday, future, withoutDueDate, paidOverdue);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ state: 'overdue' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([overdue.id]);
    expect(response.body.meta.total).toBe(1);
  });

  it.each([
    ['paid', 'pending', false],
    ['paid', 'overdue', false],
    ['pending', 'pending', true],
    ['pending', 'overdue', true],
  ] as const)(
    'combines status=%s and state=%s using AND semantics',
    async (status, state, shouldMatch) => {
      const { app, transactions } = createTestContext();
      grantMembership(transactions, 'member');
      const matching = storedTransaction({ dueDate: state === 'overdue' ? '2026-09-12' : TODAY });
      transactions.records.push(matching);
      const token = await createToken(USER_ID);

      const response = await request(app)
        .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
        .query({ status, state })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.map((record: { id: string }) => record.id)).toEqual(
        shouldMatch ? [matching.id] : [],
      );
    },
  );

  it('combines state with type, categoryId, createdBy, and date range filters', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const matching = storedTransaction({
      dueDate: '2026-09-12',
      createdBy: OTHER_USER_ID,
      transactionDate: '2026-09-10',
    });
    const base = {
      dueDate: '2026-09-12',
      createdBy: OTHER_USER_ID,
      transactionDate: '2026-09-10',
    };
    transactions.records.push(
      matching,
      storedTransaction({ ...base, type: 'income' }),
      storedTransaction({ ...base, categoryId: null }),
      storedTransaction({ ...base, createdBy: USER_ID }),
      storedTransaction({ ...base, transactionDate: '2026-09-01' }),
      storedTransaction({ ...base, transactionDate: '2026-09-30' }),
    );
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({
        state: 'overdue',
        type: 'expense',
        categoryId: EXPENSE_CATEGORY_ID,
        createdBy: OTHER_USER_ID,
        startDate: '2026-09-05',
        endDate: '2026-09-20',
      })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([matching.id]);
  });

  it('applies pagination after state and reports the state-filtered total', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ id: '00000000-0000-4000-8000-000000000001', dueDate: '2026-09-10' }),
      storedTransaction({ id: '00000000-0000-4000-8000-000000000002', dueDate: '2026-09-11' }),
      storedTransaction({ id: '00000000-0000-4000-8000-000000000003', dueDate: '2026-09-12' }),
      storedTransaction({ dueDate: TODAY }),
    );
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ state: 'overdue', page: '2', limit: '1' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toEqual({ page: 2, limit: 1, total: 3, totalPages: 3 });
  });

  it('filters by categoryId', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const matching = storedTransaction();
    transactions.records.push(matching, storedTransaction({ categoryId: null }));
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ categoryId: EXPENSE_CATEGORY_ID })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([matching.id]);
  });

  it('returns an empty list for a categoryId from another household', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(storedTransaction());
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ categoryId: CROSS_HOUSEHOLD_CATEGORY_ID })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it('filters by createdBy without treating it as the requester identity', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const matching = storedTransaction({ createdBy: OTHER_USER_ID });
    transactions.records.push(matching, storedTransaction());
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ createdBy: OTHER_USER_ID })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([matching.id]);
    expect(transactions.listCalls[0]).toMatchObject({
      requesterId: USER_ID,
      createdBy: OTHER_USER_ID,
    });
  });

  it('returns an empty list for a createdBy that only has transactions in another household', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const externalUserId = randomUUID();
    transactions.records.push(
      storedTransaction(),
      storedTransaction({ householdId: OTHER_HOUSEHOLD_ID, createdBy: externalUserId }),
    );
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ createdBy: externalUserId })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it('applies startDate inclusively', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const boundary = storedTransaction({ transactionDate: '2026-09-01' });
    transactions.records.push(boundary, storedTransaction({ transactionDate: '2026-08-31' }));
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ startDate: '2026-09-01' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([boundary.id]);
  });

  it('applies endDate inclusively', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const boundary = storedTransaction({ transactionDate: '2026-09-30' });
    transactions.records.push(boundary, storedTransaction({ transactionDate: '2026-10-01' }));
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ endDate: '2026-09-30' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([boundary.id]);
  });

  it('combines every filter with AND semantics', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const matching = storedTransaction({
      type: 'income',
      status: 'paid',
      categoryId: INCOME_CATEGORY_ID,
      createdBy: OTHER_USER_ID,
      transactionDate: '2026-09-15',
      paidAt: NOW,
    });
    const base = {
      type: 'income' as const,
      status: 'paid' as const,
      categoryId: INCOME_CATEGORY_ID,
      createdBy: OTHER_USER_ID,
      transactionDate: '2026-09-15',
      paidAt: NOW,
    };
    transactions.records.push(
      matching,
      storedTransaction({ ...base, type: 'expense' }),
      storedTransaction({ ...base, status: 'pending' }),
      storedTransaction({ ...base, categoryId: EXPENSE_CATEGORY_ID }),
      storedTransaction({ ...base, createdBy: USER_ID }),
      storedTransaction({ ...base, transactionDate: '2026-08-31' }),
      storedTransaction({ ...base, transactionDate: '2026-10-01' }),
    );
    const token = await createToken(USER_ID);
    const filters = {
      type: 'income',
      status: 'paid',
      categoryId: INCOME_CATEGORY_ID,
      createdBy: OTHER_USER_ID,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    };

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query(filters)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([matching.id]);
    expect(transactions.listCalls[0]).toMatchObject(filters);
  });

  it.each([
    ['invalid type', { type: 'transfer' }],
    ['invalid status', { status: 'overdue' }],
    ['invalid state', { state: 'paid' }],
    ['invalid categoryId UUID', { categoryId: 'invalid' }],
    ['invalid createdBy UUID', { createdBy: 'invalid' }],
    ['invalid startDate format', { startDate: '01-09-2026' }],
    ['impossible startDate', { startDate: '2026-02-30' }],
    ['year 0000 startDate', { startDate: '0000-01-01' }],
    ['invalid endDate format', { endDate: '2026/09/30' }],
    ['impossible endDate', { endDate: '2026-04-31' }],
    ['year 0000 endDate', { endDate: '0000-12-31' }],
    ['inverted date range', { startDate: '2026-10-01', endDate: '2026-09-30' }],
  ])('returns 400 and does not list for %s', async (_caseName, query) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
    });
    expect(transactions.listCalls).toHaveLength(0);
  });

  it('uses page 1 and limit 20 by default', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(transactions.listCalls[0]).toEqual({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      page: 1,
      limit: 20,
      today: TODAY,
    });
  });

  it('paginates after filtering and reports total before pagination', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const records = Array.from({ length: 5 }, (_, index) =>
      storedTransaction({
        id: `00000000-0000-4000-8000-00000000000${index}`,
        transactionDate: `2026-09-0${index + 1}`,
      }),
    );
    transactions.records.push(...records, storedTransaction({ type: 'income' }));
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ type: 'expense', page: '2', limit: '2' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([
      records[2]?.id,
      records[1]?.id,
    ]);
    expect(response.body.meta).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
  });

  it('returns an empty data page while preserving matching totals', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(storedTransaction(), storedTransaction());
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ page: '3', limit: '1' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [],
      meta: { page: 3, limit: 1, total: 2, totalPages: 2 },
    });
  });

  it.each(['0', '-1', '1.5', 'text', '9007199254740992'])(
    'rejects invalid page=%s',
    async (page) => {
      const { app, transactions } = createTestContext();
      grantMembership(transactions, 'member');
      const token = await createToken(USER_ID);

      const response = await request(app)
        .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
        .query({ page })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(transactions.listCalls).toHaveLength(0);
    },
  );

  it.each(['0', '-1', '1.5', 'text', '101'])('rejects invalid limit=%s', async (limit) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ limit })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(transactions.listCalls).toHaveLength(0);
  });

  it('rejects pagination whose offset exceeds the safe integer range', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ page: '9007199254740991', limit: '2' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(transactions.listCalls).toHaveLength(0);
  });

  it('orders by transactionDate descending first', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const older = storedTransaction({
      transactionDate: '2026-09-01',
      createdAt: new Date('2027-01-01'),
    });
    const newer = storedTransaction({
      transactionDate: '2026-09-02',
      createdAt: new Date('2025-01-01'),
    });
    transactions.records.push(older, newer);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it('orders equal transaction dates by createdAt descending', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const older = storedTransaction({ createdAt: new Date('2026-09-13T10:00:00.000Z') });
    const newer = storedTransaction({ createdAt: new Date('2026-09-13T11:00:00.000Z') });
    transactions.records.push(older, newer);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it('orders equal dates and timestamps by id descending', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const lower = storedTransaction({ id: '00000000-0000-4000-8000-000000000001' });
    const higher = storedTransaction({ id: '00000000-0000-4000-8000-000000000002' });
    transactions.records.push(lower, higher);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([
      higher.id,
      lower.id,
    ]);
  });

  it('rejects unknown query parameters', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ householdId: OTHER_HOUSEHOLD_ID })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
    });
    expect(transactions.listCalls).toHaveLength(0);
  });

  it('returns 401 without a token', async () => {
    const { app, transactions } = createTestContext();

    const response = await request(app).get(`/api/households/${HOUSEHOLD_ID}/transactions`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(transactions.listCalls).toHaveLength(0);
  });

  it('returns 400 for an invalid household UUID', async () => {
    const { app, transactions } = createTestContext();
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get('/api/households/not-a-uuid/transactions')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
    });
    expect(transactions.listCalls).toHaveLength(0);
  });

  it('returns a sanitized 500 for an unexpected listing error', async () => {
    const transactions = new InMemoryTransactionRepository(
      undefined,
      new Error('sensitive listing database details'),
    );
    const { app } = createTestContext(transactions);
    grantMembership(transactions, 'owner');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive listing database details');
  });
});

describe('PATCH /api/households/:householdId/transactions/:transactionId', () => {
  const patch = (
    app: Express,
    token: string,
    transactionId: string,
    payload: Record<string, unknown>,
    householdId = HOUSEHOLD_ID,
  ) =>
    request(app)
      .patch(`/api/households/${householdId}/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

  it('allows an owner to edit their own transaction', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { description: 'Edited' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: existing.id,
      type: 'expense',
      amount: '25.00',
      description: 'Edited',
      status: 'pending',
      createdBy: USER_ID,
      source: 'manual',
    });
    expect(transactions.records[0]).toMatchObject({
      description: 'Edited',
      householdId: HOUSEHOLD_ID,
    });
  });

  it('allows an owner to edit a transaction created by a member', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction({ createdBy: OTHER_USER_ID });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { amount: '10.00' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ amount: '10.00', createdBy: OTHER_USER_ID });
  });

  it('allows a member to edit their own transaction', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { description: 'Mine' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      description: 'Mine',
      status: 'pending',
      paidAt: null,
    });
  });

  it('forbids a member from editing a transaction created by another member', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const existing = storedTransaction({ createdBy: OTHER_USER_ID });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { description: 'Nope' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    expect(transactions.records[0]).toMatchObject({ description: existing.description });
    expect(transactions.updateCalls).toHaveLength(1);
  });

  it('returns 403 for a user without membership', async () => {
    const { app, transactions } = createTestContext();
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { description: 'Denied' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    expect(transactions.records[0]).toMatchObject({ description: existing.description });
  });

  it('returns 403 for a nonexistent household', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { description: 'Denied' }, randomUUID());

    expect(response.status).toBe(403);
    expect(transactions.records[0]).toMatchObject({ description: existing.description });
  });

  it('returns 404 for a nonexistent transaction inside an accessible household', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, randomUUID(), { description: 'Missing' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' },
    });
    expect(transactions.records[0]).toMatchObject({ description: existing.description });
  });

  it('returns 404 for a transaction that belongs to another household', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const otherHouseholdTransaction = storedTransaction({ householdId: OTHER_HOUSEHOLD_ID });
    transactions.records.push(otherHouseholdTransaction);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, otherHouseholdTransaction.id, {
      description: 'Missing',
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' },
    });
    expect(transactions.records[0]).toMatchObject({
      description: otherHouseholdTransaction.description,
      householdId: OTHER_HOUSEHOLD_ID,
    });
  });

  it('does not authorize edits through transaction authorship without membership', async () => {
    const { app, transactions } = createTestContext();
    const existing = storedTransaction({ createdBy: OTHER_USER_ID });
    transactions.records.push(existing);
    const token = await createToken(OTHER_USER_ID);

    const response = await patch(app, token, existing.id, { description: 'Should fail' });

    expect(response.status).toBe(403);
    expect(transactions.records[0]).toMatchObject({ description: existing.description });
  });

  it('edits the amount', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { amount: '99.99' });

    expect(response.status).toBe(200);
    expect(response.body.data.amount).toBe('99.99');
    expect(transactions.updateCalls[0]?.amount).toBe('99.99');
  });

  it('normalizes the amount to two decimal places', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { amount: '10' });

    expect(response.status).toBe(200);
    expect(response.body.data.amount).toBe('10.00');
    expect(transactions.records[0]?.amount).toBe('10.00');
  });

  it.each([
    ['zero', '0'],
    ['zero decimal', '0.00'],
    ['negative', '-1'],
    ['above scale', '10.123'],
    ['above precision', '1000000000000.00'],
    ['alphabetic', 'abc'],
  ])('returns 400 for an invalid amount: %s', async (_caseName, amount) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { amount });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
    });
    expect(transactions.updateCalls).toHaveLength(0);
    expect(transactions.records[0]).toMatchObject({ amount: existing.amount });
  });

  it('edits the description', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { description: 'New description' });

    expect(response.status).toBe(200);
    expect(response.body.data.description).toBe('New description');
  });

  it('removes the description with null', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction({ description: 'To be removed' });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { description: null });

    expect(response.status).toBe(200);
    expect(response.body.data.description).toBeNull();
    expect(transactions.records[0]?.description).toBeNull();
  });

  it('returns 400 for a description above the schema limit', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, {
      description: 'a'.repeat(256),
    });

    expect(response.status).toBe(400);
    expect(transactions.updateCalls).toHaveLength(0);
  });

  it('edits the transaction date', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { transactionDate: '2026-10-01' });

    expect(response.status).toBe(200);
    expect(response.body.data.transactionDate).toBe('2026-10-01');
  });

  it.each([
    ['an impossible transaction date', '2026-02-30'],
    ['a year 0000 transaction date', '0000-01-01'],
  ])('returns 400 for %s', async (_caseName, transactionDate) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { transactionDate });

    expect(response.status).toBe(400);
    expect(transactions.updateCalls).toHaveLength(0);
  });

  it('edits the due date', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { dueDate: '2026-10-05' });

    expect(response.status).toBe(200);
    expect(response.body.data.dueDate).toBe('2026-10-05');
  });

  it('removes the due date with null', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction({ dueDate: '2026-09-20' });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { dueDate: null });

    expect(response.status).toBe(200);
    expect(response.body.data.dueDate).toBeNull();
  });

  it('returns 400 for an invalid due date', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { dueDate: '2026-13-01' });

    expect(response.status).toBe(400);
    expect(transactions.updateCalls).toHaveLength(0);
  });

  it('changes the category to a valid same-household category', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction({ categoryId: null });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { categoryId: EXPENSE_CATEGORY_ID });

    expect(response.status).toBe(200);
    expect(response.body.data.categoryId).toBe(EXPENSE_CATEGORY_ID);
  });

  it('removes the category with null', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { categoryId: null });

    expect(response.status).toBe(200);
    expect(response.body.data.categoryId).toBeNull();
  });

  it.each([
    ['a nonexistent category', randomUUID()],
    ['a category from another household', CROSS_HOUSEHOLD_CATEGORY_ID],
    ['a category with a different type', INCOME_CATEGORY_ID],
  ])('returns INVALID_CATEGORY for %s', async (_caseName, categoryId) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { categoryId });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'INVALID_CATEGORY', message: 'Invalid category' },
    });
    expect(transactions.records[0]).toMatchObject({ categoryId: existing.categoryId });
  });

  it('rejects changing type while keeping an incompatible category', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { type: 'income' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'INVALID_CATEGORY', message: 'Invalid category' },
    });
    expect(transactions.records[0]).toMatchObject({ type: 'expense' });
  });

  it('accepts changing type together with a compatible category', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, {
      type: 'income',
      categoryId: INCOME_CATEGORY_ID,
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      type: 'income',
      categoryId: INCOME_CATEGORY_ID,
    });
  });

  it('accepts changing type together with a null category', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { type: 'income', categoryId: null });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ type: 'income', categoryId: null });
  });

  it('sets paidAt internally when a pending transaction becomes paid', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const beforeRequest = Date.now();
    const response = await patch(app, token, existing.id, { status: 'paid' });
    const afterRequest = Date.now();

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('paid');
    expect(Date.parse(response.body.data.paidAt)).toBeGreaterThanOrEqual(beforeRequest);
    expect(Date.parse(response.body.data.paidAt)).toBeLessThanOrEqual(afterRequest);
    expect(transactions.records[0]?.paidAt).toBeInstanceOf(Date);
  });

  it('preserves the original paidAt when a paid transaction stays paid', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const paidAt = new Date('2026-09-01T10:00:00.000Z');
    const existing = storedTransaction({ status: 'paid', paidAt });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { status: 'paid' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'paid' });
    expect(response.body.data.paidAt).toBe(paidAt.toISOString());
    expect(transactions.records[0]?.paidAt).toBe(paidAt);
  });

  it('clears paidAt when a paid transaction becomes pending', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction({ status: 'paid', paidAt: NOW });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { status: 'pending' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'pending', paidAt: null });
    expect(transactions.records[0]?.paidAt).toBeNull();
  });

  it('keeps paidAt null when a pending transaction stays pending', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { status: 'pending' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'pending', paidAt: null });
  });

  it('returns 400 for an empty body', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, {});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
    });
    expect(transactions.updateCalls).toHaveLength(0);
  });

  it.each([
    ['an invalid status', { status: 'overdue' }],
    ['an invalid type', { type: 'transfer' }],
    ['an invalid category UUID', { categoryId: 'not-a-uuid' }],
  ])('returns 400 for %s', async (_caseName, payload) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, payload);

    expect(response.status).toBe(400);
    expect(transactions.updateCalls).toHaveLength(0);
  });

  it('returns 400 for an invalid household UUID', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/not-a-uuid/transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'x' });

    expect(response.status).toBe(400);
    expect(transactions.updateCalls).toHaveLength(0);
  });

  it('returns 400 for an invalid transaction UUID', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const token = await createToken(USER_ID);

    const response = await patch(app, token, 'not-a-uuid', { description: 'x' });

    expect(response.status).toBe(400);
    expect(transactions.updateCalls).toHaveLength(0);
  });

  it.each([
    ['id', { id: randomUUID() }],
    ['householdId', { householdId: OTHER_HOUSEHOLD_ID }],
    ['createdBy', { createdBy: OTHER_USER_ID }],
    ['created_by', { created_by: OTHER_USER_ID }],
    ['userId', { userId: OTHER_USER_ID }],
    ['source', { source: 'bank_import' }],
    ['externalId', { externalId: 'external' }],
    ['external_id', { external_id: 'external' }],
    ['paidAt', { paidAt: NOW.toISOString() }],
    ['createdAt', { createdAt: NOW.toISOString() }],
    ['updatedAt', { updatedAt: NOW.toISOString() }],
    ['a timestamps field', { timestamps: true }],
    ['an extra field', { extra: true }],
  ])('returns 400 without updating for %s in the payload', async (_caseName, payload) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
    });
    expect(transactions.updateCalls).toHaveLength(0);
    expect(transactions.records[0]).toEqual(existing);
  });

  it('keeps createdBy, source, externalId and household immutable on edit', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { description: 'ok', amount: '10.00' });

    expect(response.status).toBe(200);
    expect(transactions.records[0]).toMatchObject({
      createdBy: USER_ID,
      source: 'manual',
      externalId: null,
      householdId: HOUSEHOLD_ID,
    });
    expect(response.body.data.createdBy).toBe(USER_ID);
    expect(response.body.data.source).toBe('manual');
  });

  it('does not expose internal relations in the response', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { description: 'ok' });

    expect(response.status).toBe(200);
    expect(response.body.data).not.toHaveProperty('household');
    expect(response.body.data).not.toHaveProperty('category');
    expect(response.body.data).not.toHaveProperty('user');
    expect(response.body.data).not.toHaveProperty('externalId');
  });

  it('returns a sanitized 500 for an unexpected error', async () => {
    const transactions = new InMemoryTransactionRepository(
      undefined,
      undefined,
      new Error('sensitive update database details'),
    );
    const { app } = createTestContext(transactions);
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { description: 'x' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive update database details');
  });

  it('returns 401 without a token', async () => {
    const { app } = createTestContext();

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/transactions/${randomUUID()}`)
      .send({ description: 'x' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('DELETE /api/households/:householdId/transactions/:transactionId', () => {
  const removeTransaction = (
    app: Express,
    token: string,
    transactionId: string,
    householdId: string = HOUSEHOLD_ID,
  ) =>
    request(app)
      .delete(`/api/households/${householdId}/transactions/${transactionId}`)
      .set('Authorization', `Bearer ${token}`);

  it.each([
    ['their own transaction', USER_ID],
    ['a transaction created by a member', OTHER_USER_ID],
  ] as const)(
    'allows an owner to delete %s with an empty 204 response',
    async (_case, createdBy) => {
      const { app, transactions } = createTestContext();
      grantMembership(transactions, 'owner');
      const existing = storedTransaction({ createdBy });
      transactions.records.push(existing);
      const token = await createToken(USER_ID);

      const response = await removeTransaction(app, token, existing.id);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(response.headers['content-type']).toBeUndefined();
      expect(transactions.records).toHaveLength(0);

      const listResponse = await request(app)
        .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
        .set('Authorization', `Bearer ${token}`);
      expect(listResponse.body.data).toEqual([]);
    },
  );

  it('allows a member to delete their own transaction and it cannot be updated afterwards', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const deleteResponse = await removeTransaction(app, token, existing.id);
    const updateResponse = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Too late' });

    expect(deleteResponse.status).toBe(204);
    expect(updateResponse.status).toBe(404);
    expect(updateResponse.body).toEqual({
      error: { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' },
    });
  });

  it('forbids a member from deleting another member transaction', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const existing = storedTransaction({ createdBy: OTHER_USER_ID });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await removeTransaction(app, token, existing.id);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    expect(transactions.records).toEqual([existing]);
  });

  it.each([
    ['a user without membership', HOUSEHOLD_ID, USER_ID],
    ['a nonexistent household', OTHER_HOUSEHOLD_ID, USER_ID],
    ['the transaction author without membership', HOUSEHOLD_ID, OTHER_USER_ID],
  ] as const)('returns 403 for %s', async (_case, householdId, requesterId) => {
    const { app, transactions } = createTestContext();
    const existing = storedTransaction({ createdBy: requesterId });
    transactions.records.push(existing);
    const token = await createToken(requesterId);

    const response = await removeTransaction(app, token, existing.id, householdId);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    expect(transactions.records).toEqual([existing]);
  });

  it.each([
    ['a nonexistent transaction', randomUUID()],
    [
      'a transaction from another household',
      storedTransaction({ householdId: OTHER_HOUSEHOLD_ID }).id,
    ],
  ] as const)('returns the same 404 for %s', async (caseName, transactionId) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const otherHouseholdTransaction = storedTransaction({
      id: caseName.includes('another household') ? transactionId : randomUUID(),
      householdId: OTHER_HOUSEHOLD_ID,
    });
    transactions.records.push(otherHouseholdTransaction);
    const token = await createToken(USER_ID);

    const response = await removeTransaction(app, token, transactionId);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found' },
    });
    expect(transactions.records).toEqual([otherHouseholdTransaction]);
  });

  it.each([
    ['household', 'not-a-uuid', randomUUID()],
    ['transaction', HOUSEHOLD_ID, 'not-a-uuid'],
  ] as const)(
    'returns 400 before the repository for an invalid %s UUID',
    async (_parameter, householdId, transactionId) => {
      const { app, transactions } = createTestContext();
      const token = await createToken(USER_ID);

      const response = await removeTransaction(app, token, transactionId, householdId);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
      });
      expect(transactions.deleteCalls).toHaveLength(0);
    },
  );

  it('applies the same authorization policy to a bank import transaction', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const existing = storedTransaction({ source: 'bank_import' });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await removeTransaction(app, token, existing.id);

    expect(response.status).toBe(204);
    expect(transactions.records).toHaveLength(0);
  });

  it('returns a sanitized 500 for an unexpected deletion error', async () => {
    const transactions = new InMemoryTransactionRepository(
      undefined,
      undefined,
      undefined,
      new Error('sensitive deletion database details'),
    );
    const { app } = createTestContext(transactions);
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await removeTransaction(app, token, existing.id);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive deletion database details');
  });

  it('returns 401 without authorization', async () => {
    const { app, transactions } = createTestContext();

    const response = await request(app).delete(
      `/api/households/${HOUSEHOLD_ID}/transactions/${randomUUID()}`,
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(transactions.deleteCalls).toHaveLength(0);
  });
});

describe('TypeOrmTransactionRepository', () => {
  it('checks membership and category under shared locks and forces protected insert fields', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), { id: randomUUID() });
    const category = Object.assign(new CategoryEntity(), {
      id: EXPENSE_CATEGORY_ID,
      type: 'expense',
    });
    const findCalls: Array<{ entity: unknown; options: unknown }> = [];
    let createdData: Record<string, unknown> | undefined;
    let transactionCalls = 0;
    const manager = {
      async findOne(entity: unknown, options: unknown): Promise<object | null> {
        findCalls.push({ entity, options });
        return entity === HouseholdMemberEntity ? membership : category;
      },
      create(_entity: unknown, data: Record<string, unknown>): TransactionEntity {
        createdData = data;
        return Object.assign(new TransactionEntity(), data);
      },
      async save(entity: TransactionEntity): Promise<TransactionEntity> {
        return Object.assign(entity, {
          id: randomUUID(),
          createdAt: NOW,
          updatedAt: NOW,
        });
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        transactionCalls += 1;
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    const result = await repository.createAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      type: 'expense',
      amount: '150.90',
      transactionDate: '2026-09-13',
      dueDate: null,
      categoryId: EXPENSE_CATEGORY_ID,
      description: 'Mercado',
      status: 'pending',
      paidAt: null,
    });

    expect(transactionCalls).toBe(1);
    expect(findCalls).toHaveLength(2);
    expect(findCalls[0]).toMatchObject({
      entity: HouseholdMemberEntity,
      options: {
        where: { household: { id: HOUSEHOLD_ID }, user: { id: USER_ID } },
        lock: { mode: 'pessimistic_read' },
      },
    });
    expect(findCalls[1]).toMatchObject({
      entity: CategoryEntity,
      options: {
        where: { id: EXPENSE_CATEGORY_ID, household: { id: HOUSEHOLD_ID } },
        lock: { mode: 'pessimistic_read' },
      },
    });
    expect(createdData).toMatchObject({
      household: { id: HOUSEHOLD_ID },
      category,
      createdBy: { id: USER_ID },
      source: 'manual',
      externalId: null,
    });
    expect(result).toMatchObject({
      categoryId: EXPENSE_CATEGORY_ID,
      createdBy: USER_ID,
      source: 'manual',
    });
    expect(result).not.toHaveProperty('externalId');
  });

  it.each([
    ['missing membership', null, null, ForbiddenError],
    ['missing category', new HouseholdMemberEntity(), null, InvalidCategoryError],
    [
      'category with a different type',
      new HouseholdMemberEntity(),
      Object.assign(new CategoryEntity(), { id: INCOME_CATEGORY_ID, type: 'income' }),
      InvalidCategoryError,
    ],
  ] as const)('rejects %s before inserting', async (_caseName, membership, category, errorType) => {
    let saveCalls = 0;
    const manager = {
      async findOne(entity: unknown): Promise<HouseholdMemberEntity | CategoryEntity | null> {
        return entity === HouseholdMemberEntity ? membership : category;
      },
      async save(): Promise<never> {
        saveCalls += 1;
        throw new Error('Unexpected save');
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await expect(
      repository.createAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        type: 'expense',
        amount: '10.00',
        transactionDate: '2026-09-13',
        dueDate: null,
        categoryId: EXPENSE_CATEGORY_ID,
        description: null,
        status: 'pending',
        paidAt: null,
      }),
    ).rejects.toBeInstanceOf(errorType);
    expect(saveCalls).toBe(0);
  });

  it('lists only after membership using scoped count and row queries with AND filters', async () => {
    const events: string[] = [];
    const listed = {
      id: randomUUID(),
      type: 'expense',
      amount: '25.00',
      transactionDate: '2026-09-13',
      dueDate: null,
      categoryId: EXPENSE_CATEGORY_ID,
      description: null,
      status: 'paid',
      paidAt: NOW,
      source: 'manual',
      createdBy: OTHER_USER_ID,
      createdAt: NOW,
      updatedAt: NOW,
    } as const;
    const query = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getCount: jest.fn(async () => {
        events.push('count');
        return 7;
      }),
      getRawMany: jest.fn(async () => {
        events.push('rows');
        return [listed];
      }),
    };
    const membershipFindOne = jest.fn(async (options: unknown) => {
      events.push('membership');
      return Object.assign(new HouseholdMemberEntity(), { id: randomUUID(), options });
    });
    const createQueryBuilder = jest.fn(() => {
      events.push('queryBuilder');
      return query;
    });
    const transaction = jest.fn(async () => {
      throw new Error('listAsMember must not open a transaction');
    });
    const getRepository = jest.fn((entity: unknown) => {
      if (entity === HouseholdMemberEntity) {
        return { findOne: membershipFindOne };
      }

      if (entity === TransactionEntity) {
        return { createQueryBuilder };
      }

      throw new Error('Unexpected repository');
    });
    const dataSource = { getRepository, transaction } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);
    const input: ListTransactionsData = {
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      type: 'expense',
      status: 'paid',
      categoryId: EXPENSE_CATEGORY_ID,
      createdBy: OTHER_USER_ID,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      page: 3,
      limit: 10,
      today: TODAY,
    };

    const result = await repository.listAsMember(input);

    expect(events).toEqual(['membership', 'queryBuilder', 'count', 'rows']);
    expect(transaction).not.toHaveBeenCalled();
    expect(membershipFindOne).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        household: { id: HOUSEHOLD_ID },
        user: { id: USER_ID },
      },
    });
    expect(membershipFindOne.mock.calls[0]?.[0]).not.toHaveProperty('lock');
    expect(createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(createQueryBuilder).toHaveBeenCalledWith('transaction');
    expect(query.where).toHaveBeenCalledTimes(1);
    expect(query.where).toHaveBeenCalledWith('transaction.household_id = :householdId', {
      householdId: HOUSEHOLD_ID,
    });
    expect(query.andWhere.mock.calls.slice(1)).toEqual([
      ['transaction.type = :type', { type: 'expense' }],
      ['transaction.status = :status', { status: 'paid' }],
      ['transaction.category_id = :categoryId', { categoryId: EXPENSE_CATEGORY_ID }],
      ['transaction.created_by = :createdBy', { createdBy: OTHER_USER_ID }],
      ['transaction.transaction_date >= :startDate', { startDate: '2026-09-01' }],
      ['transaction.transaction_date <= :endDate', { endDate: '2026-09-30' }],
    ]);
    expect(query.andWhere.mock.calls[0]?.[0]).toContain('FROM household_members');
    expect(query.andWhere.mock.calls[0]?.[0]).toContain(
      'requester_membership.household_id = transaction.household_id',
    );
    expect(query.andWhere.mock.calls[0]?.[1]).toEqual({ requesterId: USER_ID });
    expect(query.select).toHaveBeenCalledWith('transaction.id', 'id');
    expect(query.addSelect).toHaveBeenCalledTimes(12);
    expect(getRepository).toHaveBeenCalledTimes(2);
    expect(query.orderBy).toHaveBeenCalledWith('transaction.transaction_date', 'DESC');
    expect(query.addOrderBy.mock.calls).toEqual([
      ['transaction.created_at', 'DESC'],
      ['transaction.id', 'DESC'],
    ]);
    expect(query.offset).toHaveBeenCalledWith(20);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(query.getCount).toHaveBeenCalledTimes(1);
    expect(query.getRawMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      records: [
        {
          id: listed.id,
          type: 'expense',
          amount: '25.00',
          transactionDate: '2026-09-13',
          dueDate: null,
          categoryId: EXPENSE_CATEGORY_ID,
          description: null,
          status: 'paid',
          paidAt: NOW,
          source: 'manual',
          createdBy: OTHER_USER_ID,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      total: 7,
    });
  });

  it.each(['pending', 'overdue'] as const)(
    'applies the derived %s state to count and rows without a transaction or lock',
    async (state) => {
      const query = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getCount: jest.fn(async () => 0),
        getRawMany: jest.fn(async () => []),
      };
      const membershipFindOne = jest.fn(async () =>
        Object.assign(new HouseholdMemberEntity(), { id: randomUUID() }),
      );
      const createQueryBuilder = jest.fn(() => query);
      const transaction = jest.fn(async () => {
        throw new Error('listAsMember must not open a transaction');
      });
      const getRepository = jest.fn((entity: unknown) =>
        entity === HouseholdMemberEntity ? { findOne: membershipFindOne } : { createQueryBuilder },
      );
      const dataSource = { getRepository, transaction } as unknown as DataSource;
      const repository = new TypeOrmTransactionRepository(dataSource);

      await repository.listAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        status: 'paid',
        state,
        page: 1,
        limit: 20,
        today: TODAY,
      });

      expect(query.andWhere.mock.calls[0]?.[0]).toContain('FROM household_members');
      expect(query.andWhere.mock.calls[1]).toEqual([
        'transaction.status = :status',
        { status: 'paid' },
      ]);
      expect(query.andWhere.mock.calls[2]).toEqual([
        'transaction.status = :stateStatus',
        { stateStatus: 'pending' },
      ]);

      if (state === 'pending') {
        expect(query.andWhere).toHaveBeenCalledTimes(4);
        expect(query.andWhere.mock.calls[3]?.[0]).toContain('transaction.due_date IS NULL');
        expect(query.andWhere.mock.calls[3]?.[0]).toContain('OR transaction.due_date >= :today');
        expect(query.andWhere.mock.calls[3]?.[1]).toEqual({ today: TODAY });
      } else {
        expect(query.andWhere.mock.calls.slice(3)).toEqual([
          ['transaction.due_date IS NOT NULL'],
          ['transaction.due_date < :today', { today: TODAY }],
        ]);
      }

      expect(query.getCount).toHaveBeenCalledTimes(1);
      expect(query.getRawMany).toHaveBeenCalledTimes(1);
      expect(createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(transaction).not.toHaveBeenCalled();
      expect(query).not.toHaveProperty('setLock');
    },
  );

  it('does not create a transaction QueryBuilder when membership is absent', async () => {
    const membershipFindOne = jest.fn(async () => null);
    const createQueryBuilder = jest.fn();
    const transaction = jest.fn();
    const getRepository = jest.fn((entity: unknown) =>
      entity === HouseholdMemberEntity ? { findOne: membershipFindOne } : { createQueryBuilder },
    );
    const dataSource = { getRepository, transaction } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await expect(
      repository.listAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        page: 1,
        limit: 20,
        today: TODAY,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(membershipFindOne).toHaveBeenCalledTimes(1);
    expect(getRepository).toHaveBeenCalledTimes(1);
    expect(createQueryBuilder).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('updates the scoped transaction inside a transaction with pessimistic locks and preserves protected fields', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const existing = Object.assign(new TransactionEntity(), {
      id: randomUUID(),
      type: 'expense',
      amount: '150.90',
      transactionDate: '2026-09-13',
      dueDate: null,
      description: 'Mercado',
      status: 'paid',
      paidAt: NOW,
      source: 'manual',
      externalId: null,
      createdAt: NOW,
      category: Object.assign(new CategoryEntity(), { id: EXPENSE_CATEGORY_ID, type: 'expense' }),
      createdBy: Object.assign(new UserEntity(), { id: OTHER_USER_ID }),
    });
    const category = Object.assign(new CategoryEntity(), {
      id: INCOME_CATEGORY_ID,
      type: 'income',
    });
    const findCalls: Array<{ entity: unknown; options: unknown }> = [];
    let transactionCalls = 0;
    let savedFields: Record<string, unknown> = {};
    const manager = {
      async findOne(entity: unknown, options: unknown): Promise<object | null> {
        findCalls.push({ entity, options });
        if (entity === HouseholdMemberEntity) {
          return membership;
        }

        if (entity === TransactionEntity) {
          return existing;
        }

        if (entity === CategoryEntity) {
          return category;
        }

        return null;
      },
      async save(entity: TransactionEntity): Promise<TransactionEntity> {
        savedFields = { ...entity };
        return Object.assign(entity, { updatedAt: new Date('2026-09-14T10:00:00.000Z') });
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        transactionCalls += 1;
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    const result = await repository.updateAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      transactionId: existing.id,
      type: 'income',
      amount: '10.00',
      transactionDate: '2026-09-14',
      dueDate: '2026-09-20',
      categoryId: INCOME_CATEGORY_ID,
      description: 'Edited',
      status: 'pending',
    });

    expect(transactionCalls).toBe(1);
    expect(findCalls).toHaveLength(3);
    expect(findCalls[0]).toMatchObject({
      entity: HouseholdMemberEntity,
      options: {
        select: { id: true, role: true },
        where: { household: { id: HOUSEHOLD_ID }, user: { id: USER_ID } },
        lock: { mode: 'pessimistic_read' },
      },
    });
    expect(findCalls[1]).toMatchObject({
      entity: TransactionEntity,
      options: {
        relations: { category: true, createdBy: true },
        where: { id: existing.id, household: { id: HOUSEHOLD_ID } },
        lock: { mode: 'pessimistic_write', tables: ['transactions'] },
      },
    });
    expect(findCalls[2]).toMatchObject({
      entity: CategoryEntity,
      options: {
        where: { id: INCOME_CATEGORY_ID, household: { id: HOUSEHOLD_ID } },
        lock: { mode: 'pessimistic_read' },
      },
    });
    expect(savedFields).toMatchObject({
      type: 'income',
      amount: '10.00',
      transactionDate: '2026-09-14',
      dueDate: '2026-09-20',
      description: 'Edited',
      status: 'pending',
      paidAt: null,
      category,
    });
    expect(result).toMatchObject({
      id: existing.id,
      type: 'income',
      amount: '10.00',
      transactionDate: '2026-09-14',
      dueDate: '2026-09-20',
      categoryId: INCOME_CATEGORY_ID,
      description: 'Edited',
      status: 'pending',
      paidAt: null,
      source: 'manual',
      createdBy: OTHER_USER_ID,
    });
    expect(result.updatedAt.toISOString()).toBe('2026-09-14T10:00:00.000Z');
  });

  it('preserves the original paidAt when a paid transaction is updated as paid', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const paidAt = new Date('2026-09-01T10:00:00.000Z');
    const existing = Object.assign(new TransactionEntity(), {
      id: randomUUID(),
      type: 'expense',
      amount: '150.90',
      transactionDate: '2026-09-13',
      dueDate: null,
      description: null,
      status: 'paid',
      paidAt,
      source: 'manual',
      externalId: null,
      createdAt: NOW,
      category: null,
      createdBy: Object.assign(new UserEntity(), { id: OTHER_USER_ID }),
    });
    let saveCalls = 0;
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity
          ? membership
          : entity === TransactionEntity
            ? existing
            : null;
      },
      async save(entity: TransactionEntity): Promise<TransactionEntity> {
        saveCalls += 1;
        return entity;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    const result = await repository.updateAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      transactionId: existing.id,
      status: 'paid',
    });

    expect(saveCalls).toBe(1);
    expect(result).toMatchObject({ status: 'paid' });
    expect(result.paidAt).toBe(paidAt);
  });

  it('rejects a missing membership before reading the transaction', async () => {
    let transactionReads = 0;
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        if (entity === HouseholdMemberEntity) {
          return null;
        }

        transactionReads += 1;
        return Object.assign(new TransactionEntity(), { id: randomUUID() });
      },
      async save(): Promise<never> {
        throw new Error('Unexpected save');
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await expect(
      repository.updateAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        transactionId: randomUUID(),
        description: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transactionReads).toBe(0);
  });

  it('rejects a transaction outside the household with TransactionNotFoundError', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    let saveCalls = 0;
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity ? membership : null;
      },
      async save(): Promise<never> {
        saveCalls += 1;
        throw new Error('Unexpected save');
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await expect(
      repository.updateAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        transactionId: randomUUID(),
        description: 'x',
      }),
    ).rejects.toBeInstanceOf(TransactionNotFoundError);
    expect(saveCalls).toBe(0);
  });

  it('rejects a member editing a transaction created by another member', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'member',
    });
    const existing = Object.assign(new TransactionEntity(), {
      id: randomUUID(),
      type: 'expense',
      amount: '150.90',
      transactionDate: '2026-09-13',
      dueDate: null,
      description: null,
      status: 'pending',
      paidAt: null,
      source: 'manual',
      externalId: null,
      createdAt: NOW,
      category: null,
      createdBy: Object.assign(new UserEntity(), { id: OTHER_USER_ID }),
    });
    let saveCalls = 0;
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity
          ? membership
          : entity === TransactionEntity
            ? existing
            : null;
      },
      async save(): Promise<never> {
        saveCalls += 1;
        throw new Error('Unexpected save');
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await expect(
      repository.updateAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        transactionId: existing.id,
        description: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(saveCalls).toBe(0);
  });

  it.each([
    [
      'an incompatible kept category',
      { id: INCOME_CATEGORY_ID, type: 'income' },
      { type: 'income' },
      InvalidCategoryError,
    ],
    [
      'a wrong-type replacement category',
      { id: INCOME_CATEGORY_ID, type: 'income' },
      { type: 'expense', categoryId: INCOME_CATEGORY_ID },
      InvalidCategoryError,
    ],
  ] as const)('rejects %s before saving', async (_caseName, replacementData, input, errorType) => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const existing = Object.assign(new TransactionEntity(), {
      id: randomUUID(),
      type: 'expense',
      amount: '150.90',
      transactionDate: '2026-09-13',
      dueDate: null,
      description: null,
      status: 'pending',
      paidAt: null,
      source: 'manual',
      externalId: null,
      createdAt: NOW,
      category: Object.assign(new CategoryEntity(), {
        id: EXPENSE_CATEGORY_ID,
        type: 'expense',
      }),
      createdBy: Object.assign(new UserEntity(), { id: OTHER_USER_ID }),
    });
    const replacement = Object.assign(new CategoryEntity(), replacementData);
    let saveCalls = 0;
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        if (entity === HouseholdMemberEntity) {
          return membership;
        }

        if (entity === TransactionEntity) {
          return existing;
        }

        if (entity === CategoryEntity) {
          return replacement;
        }

        return null;
      },
      async save(): Promise<never> {
        saveCalls += 1;
        throw new Error('Unexpected save');
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await expect(
      repository.updateAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        transactionId: existing.id,
        ...input,
      }),
    ).rejects.toBeInstanceOf(errorType);
    expect(saveCalls).toBe(0);
  });

  it('deletes an authorized scoped transaction with the required locks', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const existing = Object.assign(new TransactionEntity(), {
      id: randomUUID(),
      createdBy: Object.assign(new UserEntity(), { id: OTHER_USER_ID }),
    });
    const events: string[] = [];
    const findCalls: Array<{ entity: unknown; options: unknown }> = [];
    let transactionCalls = 0;
    const manager = {
      async findOne(entity: unknown, options: unknown): Promise<object | null> {
        events.push(entity === HouseholdMemberEntity ? 'membership' : 'transaction');
        findCalls.push({ entity, options });
        return entity === HouseholdMemberEntity ? membership : existing;
      },
      async remove(entity: TransactionEntity): Promise<TransactionEntity> {
        events.push('remove');
        return entity;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        transactionCalls += 1;
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await repository.deleteAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      transactionId: existing.id,
    });

    expect(transactionCalls).toBe(1);
    expect(events).toEqual(['membership', 'transaction', 'remove']);
    expect(findCalls).toHaveLength(2);
    expect(findCalls[0]).toMatchObject({
      entity: HouseholdMemberEntity,
      options: {
        select: { id: true, role: true },
        where: { household: { id: HOUSEHOLD_ID }, user: { id: USER_ID } },
        lock: { mode: 'pessimistic_read' },
      },
    });
    expect(findCalls[1]).toEqual({
      entity: TransactionEntity,
      options: {
        select: { id: true, createdBy: { id: true } },
        relations: { createdBy: true },
        where: { id: existing.id, household: { id: HOUSEHOLD_ID } },
        lock: { mode: 'pessimistic_write', tables: ['transactions'] },
      },
    });
    expect(findCalls.some((call) => call.entity === CategoryEntity)).toBe(false);
  });

  it('does not remove a transaction created by someone else for a member', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'member',
    });
    const existing = Object.assign(new TransactionEntity(), {
      id: randomUUID(),
      createdBy: Object.assign(new UserEntity(), { id: OTHER_USER_ID }),
    });
    let removeCalls = 0;
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity ? membership : existing;
      },
      async remove(): Promise<never> {
        removeCalls += 1;
        throw new Error('Unexpected remove');
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await expect(
      repository.deleteAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        transactionId: existing.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(removeCalls).toBe(0);
  });

  it('does not remove when the scoped transaction is absent', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    let removeCalls = 0;
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity ? membership : null;
      },
      async remove(): Promise<never> {
        removeCalls += 1;
        throw new Error('Unexpected remove');
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await expect(
      repository.deleteAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        transactionId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(TransactionNotFoundError);
    expect(removeCalls).toBe(0);
  });
});
