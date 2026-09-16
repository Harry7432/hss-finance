import { randomUUID } from 'node:crypto';

import { jest } from '@jest/globals';
import { SignJWT } from 'jose';
import request from 'supertest';
import { QueryFailedError, type DataSource, type EntityManager } from 'typeorm';

import { createApp } from '../src/app.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';
import { CategoryEntity } from '../src/database/entities/category.entity.js';
import { HouseholdMemberEntity } from '../src/database/entities/household-member.entity.js';
import { RecurringTransactionEntity } from '../src/database/entities/recurring-transaction.entity.js';
import { TransactionEntity } from '../src/database/entities/transaction.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import { ForbiddenError } from '../src/errors/forbidden-error.js';
import { InvalidCategoryError } from '../src/errors/invalid-category-error.js';
import { InvalidExpenseNatureError } from '../src/errors/invalid-expense-nature-error.js';
import { RecurringTransactionNotFoundError } from '../src/errors/recurring-transaction-not-found-error.js';
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
  TypeOrmRecurringTransactionRepository,
  type CreateRecurringTransactionData,
  type GenerateRecurringTransactionsData,
  type GenerateRecurringTransactionsResult,
  type ListRecurringTransactionsData,
  type RecurringTransactionExpenseNature,
  type RecurringTransactionRecord,
  type RecurringTransactionRepository,
  type UpdateRecurringTransactionData,
} from '../src/repositories/recurring-transaction-repository.js';
import type {
  CreateTransactionData,
  DeleteTransactionData,
  GetHouseholdCategorySummaryData,
  GetHouseholdSummaryData,
  GetHouseholdUserSummaryData,
  HouseholdCategorySummaryEntry,
  HouseholdSummary,
  HouseholdUserSummaryEntry,
  ListTransactionsData,
  ListTransactionsResult,
  TransactionRecord,
  TransactionRepository,
  UpdateTransactionData,
} from '../src/repositories/transaction-repository.js';
import type { CreateUserData, UserRepository } from '../src/repositories/user-repository.js';

const TEST_JWT_SECRET = Buffer.alloc(32, 4);
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

interface StoredRecurringTransaction extends RecurringTransactionRecord {
  householdId: string;
}

class StubUserRepository implements UserRepository {
  async findByEmail(_email: string): Promise<UserEntity | null> {
    return null;
  }

  async findById(_id: string): Promise<UserEntity | null> {
    return null;
  }

  async create(_data: CreateUserData): Promise<UserEntity> {
    throw new Error('Not implemented in recurring transaction tests.');
  }
}

class StubHouseholdRepository implements HouseholdRepository {
  async createWithOwner(_data: CreateHouseholdData): Promise<CreatedHousehold | null> {
    throw new Error('Not implemented in recurring transaction tests.');
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
    throw new Error('Not implemented in recurring transaction tests.');
  }
}

class StubCategoryRepository implements CategoryRepository {
  async create(_data: CreateCategoryData): Promise<CategoryRecord> {
    throw new Error('Not implemented in recurring transaction tests.');
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

class StubTransactionRepository implements TransactionRepository {
  async createAsMember(_data: CreateTransactionData): Promise<TransactionRecord> {
    throw new Error('Not implemented in recurring transaction tests.');
  }

  async listAsMember(_data: ListTransactionsData): Promise<ListTransactionsResult> {
    return { records: [], total: 0 };
  }

  async getSummaryAsMember(_data: GetHouseholdSummaryData): Promise<HouseholdSummary> {
    throw new Error('Not implemented in recurring transaction tests.');
  }

  async getUserSummaryAsMember(
    _data: GetHouseholdUserSummaryData,
  ): Promise<HouseholdUserSummaryEntry[]> {
    throw new Error('Not implemented in recurring transaction tests.');
  }

  async getCategorySummaryAsMember(
    _data: GetHouseholdCategorySummaryData,
  ): Promise<HouseholdCategorySummaryEntry[]> {
    throw new Error('Not implemented in recurring transaction tests.');
  }

  async updateAsMember(_data: UpdateTransactionData): Promise<TransactionRecord> {
    throw new Error('Not implemented in recurring transaction tests.');
  }

  async deleteAsMember(_data: DeleteTransactionData): Promise<void> {}
}

function toMonthIndexForTest(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function daysInMonthForTest(year: number, month: number): number {
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysPerMonth[month - 1] ?? 31;
}

function occurrenceDateForTest(year: number, month: number, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, daysInMonthForTest(year, month));
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

class InMemoryRecurringTransactionRepository implements RecurringTransactionRepository {
  readonly records: StoredRecurringTransaction[] = [];
  readonly generateCalls: GenerateRecurringTransactionsData[] = [];
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
  private readonly generatedPeriods = new Set<string>();

  private membershipFor(
    householdId: string,
    userId: string,
  ): { householdId: string; userId: string; role: 'owner' | 'member' } | undefined {
    return this.memberships.find(
      (candidate) => candidate.householdId === householdId && candidate.userId === userId,
    );
  }

  async createAsMember(data: CreateRecurringTransactionData): Promise<RecurringTransactionRecord> {
    const membership = this.membershipFor(data.householdId, data.requesterId);

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

    const record: StoredRecurringTransaction = {
      id: randomUUID(),
      householdId: data.householdId,
      type: data.type,
      amount: data.amount,
      categoryId: data.categoryId,
      expenseNature: data.expenseNature,
      description: data.description,
      dayOfMonth: data.dayOfMonth,
      frequency: 'monthly',
      isActive: true,
      startDate: data.startDate,
      createdBy: data.requesterId,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.records.push(record);
    return record;
  }

  async listAsMember(data: ListRecurringTransactionsData): Promise<RecurringTransactionRecord[]> {
    const membership = this.membershipFor(data.householdId, data.requesterId);

    if (!membership) {
      throw new ForbiddenError();
    }

    return this.records
      .filter((record) => record.householdId === data.householdId)
      .filter((record) => data.isActive === undefined || record.isActive === data.isActive)
      .sort((left, right) => {
        if (left.description === null && right.description === null) {
          return left.id.localeCompare(right.id);
        }

        if (left.description === null) {
          return 1;
        }

        if (right.description === null) {
          return -1;
        }

        return left.description.localeCompare(right.description) || left.id.localeCompare(right.id);
      });
  }

  async updateAsMember(data: UpdateRecurringTransactionData): Promise<RecurringTransactionRecord> {
    const membership = this.membershipFor(data.householdId, data.requesterId);

    if (!membership) {
      throw new ForbiddenError();
    }

    const index = this.records.findIndex(
      (record) =>
        record.id === data.recurringTransactionId && record.householdId === data.householdId,
    );
    const current = this.records[index];

    if (index === -1 || current === undefined) {
      throw new RecurringTransactionNotFoundError();
    }

    if (membership.role === 'member' && current.createdBy !== data.requesterId) {
      throw new ForbiddenError();
    }

    const finalType = data.type ?? current.type;
    const finalAmount = data.amount ?? current.amount;
    const finalDayOfMonth = data.dayOfMonth ?? current.dayOfMonth;
    const finalIsActive = data.isActive ?? current.isActive;
    const finalStartDate = data.startDate ?? current.startDate;
    const finalDescription =
      data.description !== undefined ? data.description : current.description;

    let finalCategoryId: string | null;

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

    let finalExpenseNature: RecurringTransactionExpenseNature | null;

    if (finalType === 'income') {
      if (data.expenseNature !== undefined && data.expenseNature !== null) {
        throw new InvalidExpenseNatureError();
      }

      finalExpenseNature = null;
    } else if (data.expenseNature !== undefined) {
      finalExpenseNature = data.expenseNature;
    } else {
      finalExpenseNature = current.expenseNature;
    }

    const updated: StoredRecurringTransaction = {
      ...current,
      type: finalType,
      amount: finalAmount,
      categoryId: finalCategoryId,
      expenseNature: finalExpenseNature,
      description: finalDescription,
      dayOfMonth: finalDayOfMonth,
      isActive: finalIsActive,
      startDate: finalStartDate,
      updatedAt: new Date(),
    };
    this.records[index] = updated;
    return updated;
  }

  async generateAsMember(
    data: GenerateRecurringTransactionsData,
  ): Promise<GenerateRecurringTransactionsResult> {
    this.generateCalls.push(data);

    const membership = this.membershipFor(data.householdId, data.requesterId);

    if (!membership) {
      throw new ForbiddenError();
    }

    const [refYear = '0', refMonth = '1'] = data.referenceDate.split('-');
    const referenceMonthIndex = toMonthIndexForTest(Number(refYear), Number(refMonth));
    let created = 0;
    let skipped = 0;

    for (const template of this.records.filter(
      (record) => record.householdId === data.householdId && record.isActive,
    )) {
      const [startYear = '0', startMonth = '1'] = template.startDate.split('-');
      const startMonthIndex = toMonthIndexForTest(Number(startYear), Number(startMonth));

      for (let monthIndex = startMonthIndex; monthIndex <= referenceMonthIndex; monthIndex += 1) {
        const year = Math.floor(monthIndex / 12);
        const month = (monthIndex % 12) + 1;
        const occurrenceDate = occurrenceDateForTest(year, month, template.dayOfMonth);

        if (occurrenceDate < template.startDate) {
          continue;
        }

        const key = `${template.id}:${monthIndex}`;

        if (this.generatedPeriods.has(key)) {
          skipped += 1;
          continue;
        }

        this.generatedPeriods.add(key);
        created += 1;
      }
    }

    return { created, skipped };
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
  recurringTransactions: InMemoryRecurringTransactionRepository,
  role: 'owner' | 'member',
  userId = USER_ID,
  householdId = HOUSEHOLD_ID,
): void {
  recurringTransactions.memberships.push({ householdId, userId, role });
}

function createTestContext(recurringTransactions = new InMemoryRecurringTransactionRepository()) {
  const app = createApp(
    database,
    new StubUserRepository(),
    TEST_JWT_SECRET,
    new StubHouseholdRepository(),
    new StubCategoryRepository(),
    new StubTransactionRepository(),
    recurringTransactions,
  );

  return { app, recurringTransactions };
}

function validPayload(type: 'income' | 'expense' = 'expense') {
  return {
    type,
    amount: '1500.00',
    categoryId: type === 'expense' ? EXPENSE_CATEGORY_ID : INCOME_CATEGORY_ID,
    description: 'Aluguel',
    dayOfMonth: 10,
    startDate: '2026-09-01',
  };
}

function storedRecurringTransaction(
  overrides: Partial<StoredRecurringTransaction> = {},
): StoredRecurringTransaction {
  return {
    id: randomUUID(),
    householdId: HOUSEHOLD_ID,
    type: 'expense',
    amount: '25.00',
    categoryId: EXPENSE_CATEGORY_ID,
    expenseNature: null,
    description: 'Test recurring transaction',
    dayOfMonth: 10,
    frequency: 'monthly',
    isActive: true,
    startDate: '2026-01-01',
    createdBy: USER_ID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('POST /api/households/:householdId/recurring-transactions', () => {
  it.each([
    ['owner', 'expense'],
    ['member', 'expense'],
    ['owner', 'income'],
    ['member', 'income'],
  ] as const)('allows a %s to create a %s template', async (role, type) => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, role);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload(type));

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        id: expect.any(String),
        type,
        amount: '1500.00',
        categoryId: type === 'expense' ? EXPENSE_CATEGORY_ID : INCOME_CATEGORY_ID,
        expenseNature: null,
        description: 'Aluguel',
        dayOfMonth: 10,
        frequency: 'monthly',
        isActive: true,
        startDate: '2026-09-01',
        createdBy: USER_ID,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    });
    expect(recurringTransactions.records[0]).toMatchObject({
      householdId: HOUSEHOLD_ID,
      createdBy: USER_ID,
      isActive: true,
      frequency: 'monthly',
    });
  });

  it.each(['fixed', 'variable'] as const)(
    'creates an expense template with expenseNature=%s',
    async (expenseNature) => {
      const { app, recurringTransactions } = createTestContext();
      grantMembership(recurringTransactions, 'member');
      const token = await createToken(USER_ID);

      const response = await request(app)
        .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validPayload('expense'), expenseNature });

      expect(response.status).toBe(201);
      expect(response.body.data.expenseNature).toBe(expenseNature);
    },
  );

  it.each(['fixed', 'variable'] as const)(
    'returns 400 when creating an income template with expenseNature=%s',
    async (expenseNature) => {
      const { app, recurringTransactions } = createTestContext();
      grantMembership(recurringTransactions, 'owner');
      const token = await createToken(USER_ID);

      const response = await request(app)
        .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validPayload('income'), expenseNature });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
      });
      expect(recurringTransactions.records).toHaveLength(0);
    },
  );

  it.each([
    ['amount', { amount: '0' }],
    ['amount', { amount: '-1' }],
    ['amount', { amount: 10.5 }],
    ['dayOfMonth', { dayOfMonth: 0 }],
    ['dayOfMonth', { dayOfMonth: 32 }],
    ['dayOfMonth', { dayOfMonth: 1.5 }],
    ['dayOfMonth', { dayOfMonth: '10' }],
    ['startDate', { startDate: '2026-13-01' }],
    ['startDate', { startDate: '01-09-2026' }],
    ['description', { description: 'a'.repeat(256) }],
    ['frequency', { frequency: 'monthly' }],
    ['isActive', { isActive: true }],
    ['createdBy', { createdBy: OTHER_USER_ID }],
    ['householdId', { householdId: OTHER_HOUSEHOLD_ID }],
    ['id', { id: randomUUID() }],
    ['createdAt', { createdAt: NOW.toISOString() }],
    ['unknown field', { extra: true }],
  ])('returns 400 and creates nothing for invalid %s', async (_case, overrides) => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload(), ...overrides });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
    });
    expect(recurringTransactions.records).toHaveLength(0);
  });

  it.each([1, 31])('accepts dayOfMonth=%s', async (dayOfMonth) => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload(), dayOfMonth });

    expect(response.status).toBe(201);
    expect(response.body.data.dayOfMonth).toBe(dayOfMonth);
    expect(recurringTransactions.records).toHaveLength(1);
  });

  it.each([
    ['a category from another household', CROSS_HOUSEHOLD_CATEGORY_ID],
    ['a nonexistent category', randomUUID()],
    ['a category with a different type', INCOME_CATEGORY_ID],
  ])('returns INVALID_CATEGORY for %s', async (_caseName, categoryId) => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload(), categoryId });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'INVALID_CATEGORY', message: 'Invalid category' },
    });
    expect(recurringTransactions.records).toHaveLength(0);
  });

  it.each([
    ['a nonexistent household', randomUUID(), USER_ID],
    ['a user without membership', HOUSEHOLD_ID, USER_ID],
  ])(
    'returns 403 without revealing whether the household exists for %s',
    async (_case, id, userId) => {
      const { app, recurringTransactions } = createTestContext();
      const token = await createToken(userId);

      const response = await request(app)
        .post(`/api/households/${id}/recurring-transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send(validPayload());

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
      expect(recurringTransactions.records).toHaveLength(0);
    },
  );

  it('returns 401 without a token', async () => {
    const { app } = createTestContext();

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
      .send(validPayload());

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('derives createdBy from the JWT subject, not the payload', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload());

    expect(response.status).toBe(201);
    expect(response.body.data.createdBy).toBe(USER_ID);
  });
});

describe('GET /api/households/:householdId/recurring-transactions', () => {
  it.each(['owner', 'member'] as const)('allows a %s to list templates', async (role) => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, role);
    recurringTransactions.records.push(storedRecurringTransaction());
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ type: 'expense', amount: '25.00' });
  });

  it('never returns templates from another household', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'member');
    const included = storedRecurringTransaction({ description: 'Aluguel' });
    const excluded = storedRecurringTransaction({ householdId: OTHER_HOUSEHOLD_ID });
    recurringTransactions.records.push(included, excluded);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([included.id]);
  });

  it.each([true, false])('filters by isActive=%s', async (isActive) => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'member');
    const matching = storedRecurringTransaction({ isActive, description: 'A' });
    const other = storedRecurringTransaction({ isActive: !isActive, description: 'B' });
    recurringTransactions.records.push(matching, other);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
      .query({ isActive: String(isActive) })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([matching.id]);
  });

  it('returns 400 for an invalid isActive query value', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
      .query({ isActive: 'maybe' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
    });
  });

  it('orders results deterministically by description then id', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'member');
    const b = storedRecurringTransaction({ description: 'Assinatura' });
    const a = storedRecurringTransaction({ description: 'Aluguel' });
    const nullDescription = storedRecurringTransaction({ description: null });
    recurringTransactions.records.push(b, a, nullDescription);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([
      a.id,
      b.id,
      nullDescription.id,
    ]);
  });

  it('returns 403 without membership', async () => {
    const { app } = createTestContext();
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/recurring-transactions`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
  });
});

describe('PATCH /api/households/:householdId/recurring-transactions/:recurringTransactionId', () => {
  it('allows an owner to edit a template created by another member', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const existing = storedRecurringTransaction({ createdBy: OTHER_USER_ID });
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '99.99' });

    expect(response.status).toBe(200);
    expect(response.body.data.amount).toBe('99.99');
  });

  it('allows a member to edit their own template', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'member');
    const existing = storedRecurringTransaction({ createdBy: USER_ID });
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '99.99' });

    expect(response.status).toBe(200);
  });

  it('forbids a member from editing another member template', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'member');
    const existing = storedRecurringTransaction({ createdBy: OTHER_USER_ID });
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '99.99' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
  });

  it('returns 404 for a template from another household after valid membership', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const otherHouseholdTemplate = storedRecurringTransaction({
      householdId: OTHER_HOUSEHOLD_ID,
    });
    recurringTransactions.records.push(otherHouseholdTemplate);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${otherHouseholdTemplate.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '99.99' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'RECURRING_TRANSACTION_NOT_FOUND',
        message: 'Recurring transaction not found',
      },
    });
  });

  it('returns 404 for a nonexistent template', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${randomUUID()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '99.99' });

    expect(response.status).toBe(404);
  });

  it('changes the category to a compatible one', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const existing = storedRecurringTransaction({ type: 'income', categoryId: INCOME_CATEGORY_ID });
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ categoryId: INCOME_CATEGORY_ID });

    expect(response.status).toBe(200);
    expect(response.body.data.categoryId).toBe(INCOME_CATEGORY_ID);
  });

  it('rejects an incompatible category', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const existing = storedRecurringTransaction({ type: 'expense' });
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ categoryId: INCOME_CATEGORY_ID });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'INVALID_CATEGORY', message: 'Invalid category' },
    });
  });

  it.each(['fixed', 'variable'] as const)('changes expenseNature to %s', async (expenseNature) => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const existing = storedRecurringTransaction({ type: 'expense' });
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ expenseNature });

    expect(response.status).toBe(200);
    expect(response.body.data.expenseNature).toBe(expenseNature);
  });

  it('clears expenseNature automatically when switching from expense to income', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const existing = storedRecurringTransaction({
      type: 'expense',
      expenseNature: 'fixed',
      categoryId: null,
    });
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'income' });

    expect(response.status).toBe(200);
    expect(response.body.data.type).toBe('income');
    expect(response.body.data.expenseNature).toBeNull();
  });

  it('rejects an explicit expenseNature when switching to income', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const existing = storedRecurringTransaction({ type: 'expense', categoryId: null });
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'income', expenseNature: 'fixed' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
    });
  });

  it.each([
    [0, false],
    [32, false],
    [1, true],
    [31, true],
  ])('handles dayOfMonth=%s (valid=%s)', async (dayOfMonth, valid) => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const existing = storedRecurringTransaction();
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dayOfMonth });

    expect(response.status).toBe(valid ? 200 : 400);
  });

  it('deactivates and reactivates a template', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const existing = storedRecurringTransaction({ isActive: true });
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const deactivateResponse = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });

    expect(deactivateResponse.status).toBe(200);
    expect(deactivateResponse.body.data.isActive).toBe(false);

    const reactivateResponse = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: true });

    expect(reactivateResponse.status).toBe(200);
    expect(reactivateResponse.body.data.isActive).toBe(true);
  });

  it('changes the startDate', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const existing = storedRecurringTransaction();
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startDate: '2026-10-01' });

    expect(response.status).toBe(200);
    expect(response.body.data.startDate).toBe('2026-10-01');
  });

  it.each([
    ['createdBy', { createdBy: OTHER_USER_ID }],
    ['frequency', { frequency: 'monthly' }],
    ['id', { id: randomUUID() }],
    ['householdId', { householdId: OTHER_HOUSEHOLD_ID }],
  ])('rejects an unknown or immutable field: %s', async (_case, overrides) => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const existing = storedRecurringTransaction();
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(overrides);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an empty payload', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const existing = storedRecurringTransaction();
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
  });

  it('does not affect previously generated occurrences', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const existing = storedRecurringTransaction();
    recurringTransactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/${existing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '500.00' });

    expect(response.status).toBe(200);
    // Updating a template never touches the `transactions` table; occurrences
    // already materialized keep whatever amount they were generated with.
  });
});

describe('POST /api/households/:householdId/recurring-transactions/generate', () => {
  it('generates occurrences for an active template up to the reference month', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    recurringTransactions.records.push(
      storedRecurringTransaction({ startDate: '2026-07-01', isActive: true }),
    );
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ referenceDate: '2026-09-14' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { created: 3, skipped: 0 } });
  });

  it('does not generate occurrences for an inactive template', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    recurringTransactions.records.push(
      storedRecurringTransaction({ startDate: '2026-07-01', isActive: false }),
    );
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ referenceDate: '2026-09-14' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { created: 0, skipped: 0 } });
  });

  it('does not generate occurrences before the startDate month', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    recurringTransactions.records.push(storedRecurringTransaction({ startDate: '2026-12-01' }));
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ referenceDate: '2026-09-14' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { created: 0, skipped: 0 } });
  });

  it('does not generate an occurrence dated before startDate within the start month', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    recurringTransactions.records.push(
      storedRecurringTransaction({ startDate: '2026-09-20', dayOfMonth: 10 }),
    );
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ referenceDate: '2026-09-30' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { created: 0, skipped: 0 } });
  });

  it('generates the start month once the reference date reaches a later month', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    recurringTransactions.records.push(
      storedRecurringTransaction({ startDate: '2026-09-20', dayOfMonth: 10 }),
    );
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ referenceDate: '2026-11-30' });

    expect(response.status).toBe(200);
    // September is excluded (occurrence day 10 < startDate day 20); October
    // and November are both eligible.
    expect(response.body).toEqual({ data: { created: 2, skipped: 0 } });
  });

  it('is idempotent across repeated calls for the same reference month', async () => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    recurringTransactions.records.push(storedRecurringTransaction({ startDate: '2026-09-01' }));
    const token = await createToken(USER_ID);

    const first = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ referenceDate: '2026-09-14' });
    const second = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ referenceDate: '2026-09-14' });

    expect(first.body).toEqual({ data: { created: 1, skipped: 0 } });
    expect(second.body).toEqual({ data: { created: 0, skipped: 1 } });
  });

  it.each([
    ['missing referenceDate', {}],
    ['invalid format', { referenceDate: '14-09-2026' }],
    ['impossible date', { referenceDate: '2026-02-30' }],
    ['unknown field', { referenceDate: '2026-09-14', extra: true }],
  ])('returns 400 for %s', async (_case, payload) => {
    const { app, recurringTransactions } = createTestContext();
    grantMembership(recurringTransactions, 'owner');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(recurringTransactions.generateCalls).toHaveLength(0);
  });

  it('returns 403 without membership', async () => {
    const { app } = createTestContext();
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ referenceDate: '2026-09-14' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
  });

  it('returns 401 without a token', async () => {
    const { app } = createTestContext();

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/recurring-transactions/generate`)
      .send({ referenceDate: '2026-09-14' });

    expect(response.status).toBe(401);
  });
});

function constraintError(code: string, constraint: string): QueryFailedError {
  const driverError = Object.assign(new Error('database constraint details'), {
    code,
    constraint,
  });
  return new QueryFailedError('database query', [], driverError);
}

describe('TypeOrmRecurringTransactionRepository', () => {
  it('checks membership and category under shared locks and forces protected insert fields', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), { id: randomUUID() });
    const category = Object.assign(new CategoryEntity(), {
      id: EXPENSE_CATEGORY_ID,
      type: 'expense',
    });
    let createdData: Record<string, unknown> | undefined;
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity ? membership : category;
      },
      create(_entity: unknown, data: Record<string, unknown>): RecurringTransactionEntity {
        createdData = data;
        return Object.assign(new RecurringTransactionEntity(), data);
      },
      async save(entity: RecurringTransactionEntity): Promise<RecurringTransactionEntity> {
        return Object.assign(entity, { id: randomUUID(), createdAt: NOW, updatedAt: NOW });
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    const result = await repository.createAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      type: 'expense',
      amount: '1500.00',
      categoryId: EXPENSE_CATEGORY_ID,
      expenseNature: 'fixed',
      description: 'Aluguel',
      dayOfMonth: 10,
      startDate: '2026-09-01',
    });

    expect(createdData).toMatchObject({ isActive: true, frequency: 'monthly' });
    expect(result).toMatchObject({
      categoryId: EXPENSE_CATEGORY_ID,
      createdBy: USER_ID,
      isActive: true,
      frequency: 'monthly',
    });
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
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    await expect(
      repository.createAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        type: 'expense',
        amount: '10.00',
        categoryId: EXPENSE_CATEGORY_ID,
        expenseNature: null,
        description: null,
        dayOfMonth: 10,
        startDate: '2026-09-01',
      }),
    ).rejects.toBeInstanceOf(errorType);
    expect(saveCalls).toBe(0);
  });

  it('lists only after membership using an isActive filter and deterministic order', async () => {
    const membershipFindOne = jest.fn(async () =>
      Object.assign(new HouseholdMemberEntity(), { id: randomUUID() }),
    );
    const find = jest.fn(async () => []);
    const dataSource = {
      getRepository(entity: unknown) {
        if (entity === HouseholdMemberEntity) {
          return { findOne: membershipFindOne };
        }

        return { find };
      },
    } as unknown as DataSource;
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    await repository.listAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      isActive: true,
    });

    expect(membershipFindOne).toHaveBeenCalled();
    expect(find).toHaveBeenCalledWith({
      where: { household: { id: HOUSEHOLD_ID }, isActive: true },
      relations: { category: true, createdBy: true },
      order: { description: 'ASC', id: 'ASC' },
    });
  });

  it('rejects listAsMember without membership', async () => {
    const dataSource = {
      getRepository() {
        return { findOne: async () => null };
      },
    } as unknown as DataSource;
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    await expect(
      repository.listAsMember({ householdId: HOUSEHOLD_ID, requesterId: USER_ID }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('forbids a member from updating a template created by someone else', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'member',
    });
    const template = Object.assign(new RecurringTransactionEntity(), {
      id: randomUUID(),
      createdBy: Object.assign(new UserEntity(), { id: OTHER_USER_ID }),
      category: null,
    });
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity ? membership : template;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    await expect(
      repository.updateAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        recurringTransactionId: template.id,
        amount: '10.00',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns RecurringTransactionNotFoundError for a missing template', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity ? membership : null;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    await expect(
      repository.updateAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        recurringTransactionId: randomUUID(),
        amount: '10.00',
      }),
    ).rejects.toBeInstanceOf(RecurringTransactionNotFoundError);
  });

  it('rejects an incompatible existing category when switching to income without a replacement category', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const template = Object.assign(new RecurringTransactionEntity(), {
      id: randomUUID(),
      type: 'expense',
      expenseNature: 'fixed',
      createdBy: Object.assign(new UserEntity(), { id: USER_ID }),
      category: Object.assign(new CategoryEntity(), { id: EXPENSE_CATEGORY_ID, type: 'expense' }),
    });
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity ? membership : template;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    await expect(
      repository.updateAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        recurringTransactionId: template.id,
        type: 'income',
      }),
    ).rejects.toBeInstanceOf(InvalidCategoryError);
  });

  it.each([
    [2026, 2, 31, 28],
    [2028, 2, 31, 29],
    [2026, 4, 31, 30],
    [2026, 1, 31, 31],
  ])(
    'clamps a day-of-month against year=%s month=%s day=%s',
    async (year, month, dayOfMonth, expectedDay) => {
      const membership = Object.assign(new HouseholdMemberEntity(), { id: randomUUID() });
      const template = Object.assign(new RecurringTransactionEntity(), {
        id: randomUUID(),
        type: 'expense',
        amount: '10.00',
        expenseNature: 'fixed',
        description: 'Test',
        dayOfMonth,
        startDate: `${year}-${String(month).padStart(2, '0')}-01`,
        isActive: true,
        category: Object.assign(new CategoryEntity(), { id: EXPENSE_CATEGORY_ID, type: 'expense' }),
        createdBy: Object.assign(new UserEntity(), { id: USER_ID }),
      });
      let createdData: Record<string, unknown> | undefined;
      const transactionRepository = {
        create(data: Record<string, unknown>): TransactionEntity {
          createdData = data;
          return Object.assign(new TransactionEntity(), data);
        },
        async save(entity: TransactionEntity): Promise<TransactionEntity> {
          return Object.assign(entity, { id: randomUUID() });
        },
      };
      const dataSource = {
        getRepository(entity: unknown) {
          if (entity === HouseholdMemberEntity) {
            return { findOne: async () => membership };
          }

          if (entity === RecurringTransactionEntity) {
            return { find: async () => [template] };
          }

          return transactionRepository;
        },
      } as unknown as DataSource;
      const repository = new TypeOrmRecurringTransactionRepository(dataSource);

      const result = await repository.generateAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        referenceDate: `${year}-${String(month).padStart(2, '0')}-15`,
      });

      expect(result).toEqual({ created: 1, skipped: 0 });
      const expectedDate = `${year}-${String(month).padStart(2, '0')}-${String(expectedDay).padStart(2, '0')}`;
      expect(createdData).toMatchObject({
        type: 'expense',
        amount: '10.00',
        transactionDate: expectedDate,
        dueDate: expectedDate,
        status: 'pending',
        paidAt: null,
        source: 'recurring',
        externalId: null,
        description: 'Test',
        expenseNature: 'fixed',
        recurringTransaction: template,
        recurringPeriod: `${year}-${String(month).padStart(2, '0')}-01`,
      });
    },
  );

  it('generates one occurrence per elapsed month between startDate and referenceDate', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), { id: randomUUID() });
    const template = Object.assign(new RecurringTransactionEntity(), {
      id: randomUUID(),
      type: 'income',
      amount: '3000.00',
      expenseNature: null,
      description: null,
      dayOfMonth: 5,
      startDate: '2026-07-01',
      isActive: true,
      category: null,
      createdBy: Object.assign(new UserEntity(), { id: USER_ID }),
    });
    const createdPeriods: string[] = [];
    const transactionRepository = {
      create(data: Record<string, unknown>): TransactionEntity {
        createdPeriods.push(String(data.recurringPeriod));
        return Object.assign(new TransactionEntity(), data);
      },
      async save(entity: TransactionEntity): Promise<TransactionEntity> {
        return Object.assign(entity, { id: randomUUID() });
      },
    };
    const dataSource = {
      getRepository(entity: unknown) {
        if (entity === HouseholdMemberEntity) {
          return { findOne: async () => membership };
        }

        if (entity === RecurringTransactionEntity) {
          return { find: async () => [template] };
        }

        return transactionRepository;
      },
    } as unknown as DataSource;
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    const result = await repository.generateAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      referenceDate: '2026-09-14',
    });

    expect(result).toEqual({ created: 3, skipped: 0 });
    expect(createdPeriods).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
  });

  it('never generates an occurrence dated before startDate, even within the start month', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), { id: randomUUID() });
    const template = Object.assign(new RecurringTransactionEntity(), {
      id: randomUUID(),
      type: 'expense',
      amount: '1500.00',
      expenseNature: 'fixed',
      description: 'Aluguel',
      dayOfMonth: 10,
      startDate: '2026-09-20',
      isActive: true,
      category: null,
      createdBy: Object.assign(new UserEntity(), { id: USER_ID }),
    });
    const createCalls: Array<Record<string, unknown>> = [];
    const transactionRepository = {
      create(data: Record<string, unknown>): TransactionEntity {
        createCalls.push(data);
        return Object.assign(new TransactionEntity(), data);
      },
      async save(entity: TransactionEntity): Promise<TransactionEntity> {
        return Object.assign(entity, { id: randomUUID() });
      },
    };
    const dataSource = {
      getRepository(entity: unknown) {
        if (entity === HouseholdMemberEntity) {
          return { findOne: async () => membership };
        }

        if (entity === RecurringTransactionEntity) {
          return { find: async () => [template] };
        }

        return transactionRepository;
      },
    } as unknown as DataSource;
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    // startDate falls mid-month (day 20) but dayOfMonth (10) resolves to an
    // earlier day within that same start month; the occurrence would land
    // before the recurrence's effective start and must never be created.
    const result = await repository.generateAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      referenceDate: '2026-09-30',
    });

    expect(result).toEqual({ created: 0, skipped: 0 });
    expect(createCalls).toHaveLength(0);
  });

  it('generates the start month when the clamped occurrence date equals startDate', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), { id: randomUUID() });
    const template = Object.assign(new RecurringTransactionEntity(), {
      id: randomUUID(),
      type: 'expense',
      amount: '1500.00',
      expenseNature: 'fixed',
      description: 'Aluguel',
      dayOfMonth: 10,
      startDate: '2026-09-10',
      isActive: true,
      category: null,
      createdBy: Object.assign(new UserEntity(), { id: USER_ID }),
    });
    const createdDates: string[] = [];
    const transactionRepository = {
      create(data: Record<string, unknown>): TransactionEntity {
        createdDates.push(String(data.transactionDate));
        return Object.assign(new TransactionEntity(), data);
      },
      async save(entity: TransactionEntity): Promise<TransactionEntity> {
        return Object.assign(entity, { id: randomUUID() });
      },
    };
    const dataSource = {
      getRepository(entity: unknown) {
        if (entity === HouseholdMemberEntity) {
          return { findOne: async () => membership };
        }

        if (entity === RecurringTransactionEntity) {
          return { find: async () => [template] };
        }

        return transactionRepository;
      },
    } as unknown as DataSource;
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    const result = await repository.generateAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      referenceDate: '2026-09-30',
    });

    expect(result).toEqual({ created: 1, skipped: 0 });
    expect(createdDates).toEqual(['2026-09-10']);
  });

  it('skips only the start month when it precedes startDate but generates later eligible months', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), { id: randomUUID() });
    const template = Object.assign(new RecurringTransactionEntity(), {
      id: randomUUID(),
      type: 'expense',
      amount: '1500.00',
      expenseNature: 'fixed',
      description: 'Aluguel',
      dayOfMonth: 5,
      startDate: '2026-09-20',
      isActive: true,
      category: null,
      createdBy: Object.assign(new UserEntity(), { id: USER_ID }),
    });
    const createdDates: string[] = [];
    const transactionRepository = {
      create(data: Record<string, unknown>): TransactionEntity {
        createdDates.push(String(data.transactionDate));
        return Object.assign(new TransactionEntity(), data);
      },
      async save(entity: TransactionEntity): Promise<TransactionEntity> {
        return Object.assign(entity, { id: randomUUID() });
      },
    };
    const dataSource = {
      getRepository(entity: unknown) {
        if (entity === HouseholdMemberEntity) {
          return { findOne: async () => membership };
        }

        if (entity === RecurringTransactionEntity) {
          return { find: async () => [template] };
        }

        return transactionRepository;
      },
    } as unknown as DataSource;
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    const result = await repository.generateAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      referenceDate: '2026-11-30',
    });

    // September (day 5) is before startDate (Sep 20) and must be excluded;
    // October and November (day 5) fall after startDate and must generate.
    expect(result).toEqual({ created: 2, skipped: 0 });
    expect(createdDates).toEqual(['2026-10-05', '2026-11-05']);
  });

  it.each([
    ['uq_transactions_recurring_transaction_period', true],
    ['uq_other_constraint', false],
  ] as const)(
    'maps only the expected unique violation to a skip (%s)',
    async (constraint, skips) => {
      const membership = Object.assign(new HouseholdMemberEntity(), { id: randomUUID() });
      const template = Object.assign(new RecurringTransactionEntity(), {
        id: randomUUID(),
        type: 'expense',
        amount: '10.00',
        expenseNature: null,
        description: null,
        dayOfMonth: 5,
        startDate: '2026-09-01',
        isActive: true,
        category: null,
        createdBy: Object.assign(new UserEntity(), { id: USER_ID }),
      });
      const error = constraintError('23505', constraint);
      const transactionRepository = {
        create(data: Record<string, unknown>): TransactionEntity {
          return Object.assign(new TransactionEntity(), data);
        },
        async save(): Promise<never> {
          throw error;
        },
      };
      const dataSource = {
        getRepository(entity: unknown) {
          if (entity === HouseholdMemberEntity) {
            return { findOne: async () => membership };
          }

          if (entity === RecurringTransactionEntity) {
            return { find: async () => [template] };
          }

          return transactionRepository;
        },
      } as unknown as DataSource;
      const repository = new TypeOrmRecurringTransactionRepository(dataSource);

      const call = repository.generateAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        referenceDate: '2026-09-14',
      });

      if (skips) {
        await expect(call).resolves.toEqual({ created: 0, skipped: 1 });
      } else {
        await expect(call).rejects.toBe(error);
      }
    },
  );

  it('rejects generateAsMember without membership', async () => {
    const dataSource = {
      getRepository() {
        return { findOne: async () => null };
      },
    } as unknown as DataSource;
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    await expect(
      repository.generateAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        referenceDate: '2026-09-14',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('excludes inactive templates from generation', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), { id: randomUUID() });
    const find = jest.fn(async () => []);
    const dataSource = {
      getRepository(entity: unknown) {
        if (entity === HouseholdMemberEntity) {
          return { findOne: async () => membership };
        }

        return { find };
      },
    } as unknown as DataSource;
    const repository = new TypeOrmRecurringTransactionRepository(dataSource);

    await repository.generateAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      referenceDate: '2026-09-14',
    });

    expect(find).toHaveBeenCalledWith({
      where: { household: { id: HOUSEHOLD_ID }, isActive: true },
      relations: { category: true, createdBy: true },
    });
  });
});
