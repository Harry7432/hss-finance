import { randomUUID } from 'node:crypto';

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
  type TransactionRecord,
  type TransactionRepository,
} from '../src/repositories/transaction-repository.js';
import type { CreateUserData, UserRepository } from '../src/repositories/user-repository.js';
import type { UserEntity } from '../src/database/entities/user.entity.js';

const TEST_JWT_SECRET = Buffer.alloc(32, 3);
const USER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();
const HOUSEHOLD_ID = randomUUID();
const OTHER_HOUSEHOLD_ID = randomUUID();
const EXPENSE_CATEGORY_ID = randomUUID();
const INCOME_CATEGORY_ID = randomUUID();
const CROSS_HOUSEHOLD_CATEGORY_ID = randomUUID();
const NOW = new Date('2026-09-13T18:00:00.000Z');
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

  constructor(private readonly createError?: Error) {}

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

function createTestContext(transactions = new InMemoryTransactionRepository()) {
  const app = createApp(
    database,
    new StubUserRepository(),
    TEST_JWT_SECRET,
    new StubHouseholdRepository(),
    new StubCategoryRepository(),
    transactions,
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
});
