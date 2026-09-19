import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { jest } from '@jest/globals';
import type { Express } from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import type { DataSource, EntityManager } from 'typeorm';

import { createApp } from '../src/app.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';
import { CategoryEntity } from '../src/database/entities/category.entity.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { HouseholdMemberEntity } from '../src/database/entities/household-member.entity.js';
import { TransactionEntity } from '../src/database/entities/transaction.entity.js';
import { ForbiddenError } from '../src/errors/forbidden-error.js';
import { InvalidCategoryError } from '../src/errors/invalid-category-error.js';
import { InvalidExpenseNatureError } from '../src/errors/invalid-expense-nature-error.js';
import { TransactionAlreadyPaidError } from '../src/errors/transaction-already-paid-error.js';
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
import type {
  CreatePaymentAttemptData,
  MarkPaymentAttemptOutcomeData,
  MarkPaymentAttemptProcessingData,
  PaymentAttemptRecord,
  PaymentAttemptRepository,
} from '../src/repositories/payment-attempt-repository.js';
import type {
  CreateRecurringTransactionData,
  GenerateRecurringTransactionsData,
  GenerateRecurringTransactionsResult,
  ListRecurringTransactionsData,
  RecurringTransactionRecord,
  RecurringTransactionRepository,
  UpdateRecurringTransactionData,
} from '../src/repositories/recurring-transaction-repository.js';
import {
  TypeOrmTransactionRepository,
  type CreateTransactionData,
  type DeleteTransactionData,
  type FindPendingTransactionAsOwnerData,
  type GetHouseholdCategorySummaryData,
  type GetHouseholdMonthlySummaryData,
  type GetHouseholdSummaryData,
  type GetHouseholdUserSummaryData,
  type HouseholdCategorySummaryEntry,
  type HouseholdMonthlySummaryEntry,
  type HouseholdSummary,
  type HouseholdUserSummaryEntry,
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

function amountToCents(amount: string): bigint {
  const [integer = '0', fraction = ''] = amount.split('.');
  return BigInt(`${integer}${fraction.padEnd(2, '0')}`);
}

function formatCents(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

function computeExpenseSharePercentageForTest(
  userExpenseCents: bigint,
  householdExpenseCents: bigint,
): string {
  if (householdExpenseCents === 0n) {
    return '0.00';
  }

  const scaledNumerator = userExpenseCents * 10000n;
  const quotient = scaledNumerator / householdExpenseCents;
  const remainder = scaledNumerator % householdExpenseCents;
  const roundedHundredths = remainder * 2n >= householdExpenseCents ? quotient + 1n : quotient;

  return `${roundedHundredths / 100n}.${(roundedHundredths % 100n).toString().padStart(2, '0')}`;
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

class StubRecurringTransactionRepository implements RecurringTransactionRepository {
  async createAsMember(_data: CreateRecurringTransactionData): Promise<RecurringTransactionRecord> {
    throw new Error('Not implemented in transaction tests.');
  }

  async listAsMember(_data: ListRecurringTransactionsData): Promise<RecurringTransactionRecord[]> {
    return [];
  }

  async updateAsMember(_data: UpdateRecurringTransactionData): Promise<RecurringTransactionRecord> {
    throw new Error('Not implemented in transaction tests.');
  }

  async generateAsMember(
    _data: GenerateRecurringTransactionsData,
  ): Promise<GenerateRecurringTransactionsResult> {
    return { created: 0, skipped: 0 };
  }
}

class StubPaymentAttemptRepository implements PaymentAttemptRepository {
  async createPaymentAttempt(_data: CreatePaymentAttemptData): Promise<PaymentAttemptRecord> {
    throw new Error('Not implemented in transaction tests.');
  }

  async markProcessing(_data: MarkPaymentAttemptProcessingData): Promise<PaymentAttemptRecord> {
    throw new Error('Not implemented in transaction tests.');
  }

  async markFailed(_data: MarkPaymentAttemptOutcomeData): Promise<PaymentAttemptRecord> {
    throw new Error('Not implemented in transaction tests.');
  }

  async markUncertain(_data: MarkPaymentAttemptOutcomeData): Promise<PaymentAttemptRecord> {
    throw new Error('Not implemented in transaction tests.');
  }
}

class InMemoryTransactionRepository implements TransactionRepository {
  readonly records: StoredTransaction[] = [];
  readonly createCalls: CreateTransactionData[] = [];
  readonly deleteCalls: DeleteTransactionData[] = [];
  readonly listCalls: ListTransactionsData[] = [];
  readonly summaryCalls: GetHouseholdSummaryData[] = [];
  readonly userSummaryCalls: GetHouseholdUserSummaryData[] = [];
  readonly categorySummaryCalls: GetHouseholdCategorySummaryData[] = [];
  readonly monthlySummaryCalls: GetHouseholdMonthlySummaryData[] = [];
  readonly updateCalls: UpdateTransactionData[] = [];
  readonly memberships: Array<{
    householdId: string;
    userId: string;
    role: 'owner' | 'member';
    name: string;
  }> = [];
  readonly categories = [
    {
      id: EXPENSE_CATEGORY_ID,
      householdId: HOUSEHOLD_ID,
      type: 'expense' as const,
      name: 'Mercado',
    },
    { id: INCOME_CATEGORY_ID, householdId: HOUSEHOLD_ID, type: 'income' as const, name: 'Salário' },
    {
      id: CROSS_HOUSEHOLD_CATEGORY_ID,
      householdId: OTHER_HOUSEHOLD_ID,
      type: 'expense' as const,
      name: 'Outra família',
    },
  ];

  constructor(
    private readonly createError?: Error,
    private readonly listError?: Error,
    private readonly updateError?: Error,
    private readonly deleteError?: Error,
    private readonly summaryError?: Error,
    private readonly userSummaryError?: Error,
    private readonly categorySummaryError?: Error,
    private readonly monthlySummaryError?: Error,
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
      expenseNature: data.expenseNature,
      recurringTransactionId: null,
      recurringPeriod: null,
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
      .filter(
        (record) => data.expenseNature === undefined || record.expenseNature === data.expenseNature,
      )
      .filter(
        (record) =>
          data.recurringTransactionId === undefined ||
          record.recurringTransactionId === data.recurringTransactionId,
      )
      .filter((record) => data.startDate === undefined || record.transactionDate >= data.startDate)
      .filter((record) => data.endDate === undefined || record.transactionDate <= data.endDate)
      .sort((left, right) => {
        if (data.sortBy === 'dueDate') {
          // Mirrors TypeOrmTransactionRepository: dueDate NULLS LAST regardless of direction,
          // with createdAt/id tie-breaks in the same direction as the primary sort.
          if (left.dueDate === null && right.dueDate === null) {
            return 0;
          }

          if (left.dueDate === null) {
            return 1;
          }

          if (right.dueDate === null) {
            return -1;
          }

          const direction = data.sortOrder === 'desc' ? -1 : 1;

          return (
            direction * left.dueDate.localeCompare(right.dueDate) ||
            direction * (left.createdAt.getTime() - right.createdAt.getTime()) ||
            direction * left.id.localeCompare(right.id)
          );
        }

        return (
          right.transactionDate.localeCompare(left.transactionDate) ||
          right.createdAt.getTime() - left.createdAt.getTime() ||
          right.id.localeCompare(left.id)
        );
      });
    const offset = (data.page - 1) * data.limit;

    return {
      records: filtered.slice(offset, offset + data.limit),
      total: filtered.length,
    };
  }

  async getSummaryAsMember(data: GetHouseholdSummaryData): Promise<HouseholdSummary> {
    this.summaryCalls.push(data);

    if (this.summaryError) {
      throw this.summaryError;
    }

    const membership = this.memberships.find(
      (candidate) =>
        candidate.householdId === data.householdId && candidate.userId === data.requesterId,
    );

    if (!membership) {
      throw new ForbiddenError();
    }

    let totalIncome = 0n;
    let totalExpense = 0n;

    for (const record of this.records) {
      if (
        record.householdId !== data.householdId ||
        (data.startDate !== undefined && record.transactionDate < data.startDate) ||
        (data.endDate !== undefined && record.transactionDate > data.endDate)
      ) {
        continue;
      }

      if (record.type === 'income') {
        totalIncome += amountToCents(record.amount);
      } else {
        totalExpense += amountToCents(record.amount);
      }
    }

    return {
      totalIncome: formatCents(totalIncome),
      totalExpense: formatCents(totalExpense),
      balance: formatCents(totalIncome - totalExpense),
    };
  }

  async getUserSummaryAsMember(
    data: GetHouseholdUserSummaryData,
  ): Promise<HouseholdUserSummaryEntry[]> {
    this.userSummaryCalls.push(data);

    if (this.userSummaryError) {
      throw this.userSummaryError;
    }

    const requesterMembership = this.memberships.find(
      (candidate) =>
        candidate.householdId === data.householdId && candidate.userId === data.requesterId,
    );

    if (!requesterMembership) {
      throw new ForbiddenError();
    }

    const householdMembers = this.memberships.filter(
      (candidate) => candidate.householdId === data.householdId,
    );

    const perUser = householdMembers.map((member) => {
      let totalIncome = 0n;
      let totalExpense = 0n;

      for (const record of this.records) {
        if (
          record.householdId !== data.householdId ||
          record.createdBy !== member.userId ||
          (data.startDate !== undefined && record.transactionDate < data.startDate) ||
          (data.endDate !== undefined && record.transactionDate > data.endDate)
        ) {
          continue;
        }

        if (record.type === 'income') {
          totalIncome += amountToCents(record.amount);
        } else {
          totalExpense += amountToCents(record.amount);
        }
      }

      return { userId: member.userId, name: member.name, totalIncome, totalExpense };
    });

    const householdTotalExpense = perUser.reduce((sum, entry) => sum + entry.totalExpense, 0n);

    return perUser
      .map((entry) => ({
        userId: entry.userId,
        name: entry.name,
        totalIncome: formatCents(entry.totalIncome),
        totalExpense: formatCents(entry.totalExpense),
        balance: formatCents(entry.totalIncome - entry.totalExpense),
        expenseSharePercentage: computeExpenseSharePercentageForTest(
          entry.totalExpense,
          householdTotalExpense,
        ),
      }))
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) || left.userId.localeCompare(right.userId),
      );
  }

  async getCategorySummaryAsMember(
    data: GetHouseholdCategorySummaryData,
  ): Promise<HouseholdCategorySummaryEntry[]> {
    this.categorySummaryCalls.push(data);

    if (this.categorySummaryError) {
      throw this.categorySummaryError;
    }

    const membership = this.memberships.find(
      (candidate) =>
        candidate.householdId === data.householdId && candidate.userId === data.requesterId,
    );

    if (!membership) {
      throw new ForbiddenError();
    }

    const totals = new Map<string | null, bigint>();

    for (const record of this.records) {
      if (
        record.householdId !== data.householdId ||
        record.type !== 'expense' ||
        (data.startDate !== undefined && record.transactionDate < data.startDate) ||
        (data.endDate !== undefined && record.transactionDate > data.endDate)
      ) {
        continue;
      }

      totals.set(
        record.categoryId,
        (totals.get(record.categoryId) ?? 0n) + amountToCents(record.amount),
      );
    }

    const categoryNameById = new Map<string, string>(
      this.categories.map((category) => [category.id, category.name]),
    );

    return Array.from(totals.entries())
      .sort(([leftId, leftCents], [rightId, rightCents]) => {
        if (rightCents !== leftCents) {
          return rightCents > leftCents ? 1 : -1;
        }

        return (leftId ?? '').localeCompare(rightId ?? '');
      })
      .map(([categoryId, cents]) => ({
        categoryId,
        categoryName:
          categoryId === null
            ? 'Sem categoria'
            : (categoryNameById.get(categoryId) ?? 'Sem categoria'),
        totalExpense: formatCents(cents),
      }));
  }

  async getMonthlySummaryAsMember(
    data: GetHouseholdMonthlySummaryData,
  ): Promise<HouseholdMonthlySummaryEntry[]> {
    this.monthlySummaryCalls.push(data);

    if (this.monthlySummaryError) {
      throw this.monthlySummaryError;
    }

    const membership = this.memberships.find(
      (candidate) =>
        candidate.householdId === data.householdId && candidate.userId === data.requesterId,
    );

    if (!membership) {
      throw new ForbiddenError();
    }

    return data.months.map((month) => {
      let totalIncome = 0n;
      let totalExpense = 0n;

      for (const record of this.records) {
        if (record.householdId !== data.householdId || !record.transactionDate.startsWith(month)) {
          continue;
        }

        if (record.type === 'income') {
          totalIncome += amountToCents(record.amount);
        } else {
          totalExpense += amountToCents(record.amount);
        }
      }

      return {
        month,
        totalIncome: formatCents(totalIncome),
        totalExpense: formatCents(totalExpense),
        balance: formatCents(totalIncome - totalExpense),
      };
    });
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

    let finalExpenseNature: TransactionRecord['expenseNature'];

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
      expenseNature: finalExpenseNature,
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
  name = 'Member',
): void {
  transactions.memberships.push({ householdId, userId, role, name });
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
    new StubPaymentAttemptRepository(),
    new StubRecurringTransactionRepository(),
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
    expenseNature: null,
    recurringTransactionId: null,
    recurringPeriod: null,
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
        expenseNature: null,
        recurringTransactionId: null,
        recurringPeriod: null,
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
      recurringTransactionId: null,
      recurringPeriod: null,
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

  it.each(['fixed', 'variable'] as const)(
    'creates an expense with expenseNature=%s',
    async (expenseNature) => {
      const { app, transactions } = createTestContext();
      grantMembership(transactions, 'member');
      const token = await createToken(USER_ID);

      const response = await request(app)
        .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validPayload('expense'), expenseNature });

      expect(response.status).toBe(201);
      expect(response.body.data.expenseNature).toBe(expenseNature);
      expect(transactions.createCalls[0]?.expenseNature).toBe(expenseNature);
    },
  );

  it('creates an expense without expenseNature and defaults it to null', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload('expense'));

    expect(response.status).toBe(201);
    expect(response.body.data.expenseNature).toBeNull();
    expect(transactions.createCalls[0]?.expenseNature).toBeNull();
  });

  it('creates an income without expenseNature and defaults it to null', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send(validPayload('income'));

    expect(response.status).toBe(201);
    expect(response.body.data.expenseNature).toBeNull();
    expect(transactions.createCalls[0]?.expenseNature).toBeNull();
  });

  it.each(['fixed', 'variable'] as const)(
    'returns 400 when creating an income with expenseNature=%s',
    async (expenseNature) => {
      const { app, transactions } = createTestContext();
      grantMembership(transactions, 'owner');
      const token = await createToken(USER_ID);

      const response = await request(app)
        .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validPayload('income'), expenseNature });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
      });
      expect(transactions.createCalls).toHaveLength(0);
      expect(transactions.records).toHaveLength(0);
    },
  );

  it('accepts an explicit null expenseNature for an income', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload('income'), expenseNature: null });

    expect(response.status).toBe(201);
    expect(response.body.data.expenseNature).toBeNull();
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
    ['a transaction creator without membership', HOUSEHOLD_ID, OTHER_USER_ID],
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
    ['invalid expenseNature', { ...validPayload(), expenseNature: 'half' }],
    ['numeric expenseNature', { ...validPayload(), expenseNature: 1 }],
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
            expenseNature: null,
            recurringTransactionId: null,
            recurringPeriod: null,
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

  it('keeps the default order (transactionDate DESC, createdAt DESC, id DESC) when sortBy is absent', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const older = storedTransaction({ transactionDate: '2026-09-01', dueDate: '2026-09-30' });
    const newer = storedTransaction({ transactionDate: '2026-09-15', dueDate: '2026-09-05' });
    transactions.records.push(older, newer);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([
      newer.id,
      older.id,
    ]);
    expect(transactions.listCalls[0]).not.toHaveProperty('sortBy');
  });

  it('orders by dueDate ascending when sortBy=dueDate, with NULL dueDate last', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const soonest = storedTransaction({ dueDate: '2026-09-10' });
    const middle = storedTransaction({ dueDate: '2026-09-20' });
    const latest = storedTransaction({ dueDate: '2026-09-30' });
    const withoutDueDate = storedTransaction({ dueDate: null });
    transactions.records.push(latest, withoutDueDate, soonest, middle);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ sortBy: 'dueDate' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([
      soonest.id,
      middle.id,
      latest.id,
      withoutDueDate.id,
    ]);
    expect(transactions.listCalls[0]).toMatchObject({ sortBy: 'dueDate' });
  });

  it('orders by dueDate descending when sortBy=dueDate&sortOrder=desc, with NULL dueDate still last', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const soonest = storedTransaction({ dueDate: '2026-09-10' });
    const latest = storedTransaction({ dueDate: '2026-09-30' });
    const withoutDueDate = storedTransaction({ dueDate: null });
    transactions.records.push(soonest, withoutDueDate, latest);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ sortBy: 'dueDate', sortOrder: 'desc' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([
      latest.id,
      soonest.id,
      withoutDueDate.id,
    ]);
    expect(transactions.listCalls[0]).toMatchObject({ sortBy: 'dueDate', sortOrder: 'desc' });
  });

  it('breaks a dueDate tie deterministically by id, in the same direction as the primary sort', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const first = storedTransaction({
      id: '00000000-0000-4000-8000-000000000001',
      dueDate: '2026-09-15',
    });
    const second = storedTransaction({
      id: '00000000-0000-4000-8000-000000000002',
      dueDate: '2026-09-15',
    });
    transactions.records.push(second, first);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ sortBy: 'dueDate' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('combines state=overdue with sortBy=dueDate, ordering the most overdue account first', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const mostOverdue = storedTransaction({ dueDate: '2026-08-01' });
    const leastOverdue = storedTransaction({ dueDate: '2026-09-12' });
    const notOverdue = storedTransaction({ dueDate: '2026-09-20' });
    transactions.records.push(notOverdue, leastOverdue, mostOverdue);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ state: 'overdue', sortBy: 'dueDate' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([
      mostOverdue.id,
      leastOverdue.id,
    ]);
    expect(transactions.listCalls[0]).toMatchObject({ state: 'overdue', sortBy: 'dueDate' });
  });

  it('combines state=pending with sortBy=dueDate, ordering the soonest due account first', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const dueToday = storedTransaction({ dueDate: TODAY });
    const dueSoon = storedTransaction({ dueDate: '2026-09-16' });
    const dueLater = storedTransaction({ dueDate: '2026-09-30' });
    const withoutDueDate = storedTransaction({ dueDate: null });
    transactions.records.push(dueLater, withoutDueDate, dueToday, dueSoon);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ state: 'pending', sortBy: 'dueDate' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([
      dueToday.id,
      dueSoon.id,
      dueLater.id,
      withoutDueDate.id,
    ]);
    expect(transactions.listCalls[0]).toMatchObject({ state: 'pending', sortBy: 'dueDate' });
  });

  it.each([
    ['a nonexistent household', randomUUID(), USER_ID],
    ['a user without membership', HOUSEHOLD_ID, OTHER_USER_ID],
  ] as const)(
    'returns the same 403 for %s even when sortBy=dueDate is requested, without leaking household state',
    async (_caseName, householdId, userId) => {
      const { app, transactions } = createTestContext();
      transactions.records.push(storedTransaction());
      const token = await createToken(userId);

      const response = await request(app)
        .get(`/api/households/${householdId}/transactions`)
        .query({ sortBy: 'dueDate' })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    },
  );

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

  it.each(['fixed', 'variable'] as const)('filters by expenseNature=%s', async (expenseNature) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const matching = storedTransaction({ expenseNature });
    const other = storedTransaction({
      expenseNature: expenseNature === 'fixed' ? 'variable' : 'fixed',
    });
    const unclassified = storedTransaction({ expenseNature: null });
    transactions.records.push(matching, other, unclassified);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ expenseNature })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([matching.id]);
    expect(response.body.data[0].expenseNature).toBe(expenseNature);
    expect(transactions.listCalls[0]).toMatchObject({ expenseNature });
  });

  it('does not mix expenseNature matches from another household', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const matching = storedTransaction({ expenseNature: 'fixed' });
    const otherHousehold = storedTransaction({
      expenseNature: 'fixed',
      householdId: OTHER_HOUSEHOLD_ID,
    });
    transactions.records.push(matching, otherHousehold);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ expenseNature: 'fixed' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([matching.id]);
  });

  it('combines expenseNature with type using AND semantics', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const matching = storedTransaction({ type: 'expense', expenseNature: 'fixed' });
    const wrongType = storedTransaction({
      type: 'income',
      categoryId: INCOME_CATEGORY_ID,
      expenseNature: null,
    });
    transactions.records.push(matching, wrongType);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ type: 'expense', expenseNature: 'fixed' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([matching.id]);
  });

  it('combines expenseNature with categoryId using AND semantics', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const matching = storedTransaction({ categoryId: EXPENSE_CATEGORY_ID, expenseNature: 'fixed' });
    const otherCategory = storedTransaction({ categoryId: null, expenseNature: 'fixed' });
    transactions.records.push(matching, otherCategory);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ categoryId: EXPENSE_CATEGORY_ID, expenseNature: 'fixed' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([matching.id]);
  });

  it('combines expenseNature with a startDate/endDate range using AND semantics', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const matching = storedTransaction({
      transactionDate: '2026-09-15',
      expenseNature: 'fixed',
    });
    const outsideRange = storedTransaction({
      transactionDate: '2026-10-01',
      expenseNature: 'fixed',
    });
    transactions.records.push(matching, outsideRange);
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ expenseNature: 'fixed', startDate: '2026-09-01', endDate: '2026-09-30' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((record: { id: string }) => record.id)).toEqual([matching.id]);
  });

  it('rejects an invalid expenseNature filter value', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/transactions`)
      .query({ expenseNature: 'half' })
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
    });
    expect(transactions.listCalls).toHaveLength(0);
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
    ['invalid sortBy column', { sortBy: 'transactionDate' }],
    ['invalid sortBy value', { sortBy: 'amount' }],
    ['invalid sortOrder value', { sortBy: 'dueDate', sortOrder: 'ascending' }],
    ['sortOrder without sortBy', { sortOrder: 'asc' }],
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

describe('GET /api/households/:householdId/summary', () => {
  const getSummary = (
    app: Express,
    token: string,
    query: Record<string, unknown> = {},
    householdId: string = HOUSEHOLD_ID,
  ) =>
    request(app)
      .get(`/api/households/${householdId}/summary`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);

  it.each(['owner', 'member'] as const)(
    'allows an authenticated %s to view an empty summary',
    async (role) => {
      const { app, transactions } = createTestContext();
      grantMembership(transactions, role);
      const token = await createToken(USER_ID);

      const response = await getSummary(app, token);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: { totalIncome: '0.00', totalExpense: '0.00', balance: '0.00' },
      });
      expect(Object.keys(response.body.data)).toEqual(['totalIncome', 'totalExpense', 'balance']);
      expect(Object.values(response.body.data).every((value) => typeof value === 'string')).toBe(
        true,
      );
    },
  );

  it('sums multiple incomes and returns zero expense with a positive balance', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ type: 'income', amount: '10.00' }),
      storedTransaction({ type: 'income', amount: '20.50' }),
    );
    const token = await createToken(USER_ID);

    const response = await getSummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { totalIncome: '30.50', totalExpense: '0.00', balance: '30.50' },
    });
  });

  it('sums multiple expenses and returns zero income with a negative balance', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ amount: '10.00' }),
      storedTransaction({ amount: '20.50' }),
    );
    const token = await createToken(USER_ID);

    const response = await getSummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { totalIncome: '0.00', totalExpense: '30.50', balance: '-30.50' },
    });
  });

  it('sums fixed and variable expenses together without a separate breakdown', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ amount: '10.00', expenseNature: 'fixed' }),
      storedTransaction({ amount: '20.50', expenseNature: 'variable' }),
      storedTransaction({ amount: '5.00', expenseNature: null }),
    );
    const token = await createToken(USER_ID);

    const response = await getSummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: { totalIncome: '0.00', totalExpense: '35.50', balance: '-35.50' },
    });
    expect(Object.keys(response.body.data)).toEqual(['totalIncome', 'totalExpense', 'balance']);
  });

  it('preserves precision and includes every status and source in the balance', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    transactions.records.push(
      storedTransaction({ type: 'income', amount: '999999999900.10', status: 'pending' }),
      storedTransaction({
        type: 'income',
        amount: '0.20',
        status: 'paid',
        paidAt: NOW,
        source: 'bank_import',
      }),
      storedTransaction({ amount: '0.03', status: 'pending', dueDate: '2026-09-12' }),
      storedTransaction({ amount: '0.07', status: 'paid', paidAt: NOW, source: 'bank_import' }),
    );
    const token = await createToken(USER_ID);

    const response = await getSummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        totalIncome: '999999999900.30',
        totalExpense: '0.10',
        balance: '999999999900.20',
      },
    });
  });

  it.each([
    ['only startDate', { startDate: '2026-09-10' }, '14.00'],
    ['only endDate', { endDate: '2026-09-20' }, '7.00'],
    ['inclusive startDate and endDate', { startDate: '2026-09-10', endDate: '2026-09-20' }, '6.00'],
  ] as const)('applies %s to transactionDate', async (_caseName, query, totalIncome) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ type: 'income', amount: '1.00', transactionDate: '2026-09-01' }),
      storedTransaction({ type: 'income', amount: '2.00', transactionDate: '2026-09-10' }),
      storedTransaction({ type: 'income', amount: '4.00', transactionDate: '2026-09-20' }),
      storedTransaction({ type: 'income', amount: '8.00', transactionDate: '2026-09-30' }),
    );
    const token = await createToken(USER_ID);

    const response = await getSummary(app, token, query);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      totalIncome,
      totalExpense: '0.00',
      balance: totalIncome,
    });
    expect(transactions.summaryCalls[0]).toMatchObject(query);
  });

  it.each([
    ['an inverted range', { startDate: '2026-09-20', endDate: '2026-09-10' }],
    ['an invalid startDate', { startDate: '2026-02-30' }],
    ['an invalid endDate', { endDate: '13-09-2026' }],
    ['an unknown query', { status: 'paid' }],
  ])('returns 400 without querying the repository for %s', async (_caseName, query) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await getSummary(app, token, query);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
    });
    expect(transactions.summaryCalls).toHaveLength(0);
  });

  it('returns 401 without Authorization', async () => {
    const { app, transactions } = createTestContext();

    const response = await request(app).get(`/api/households/${HOUSEHOLD_ID}/summary`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(transactions.summaryCalls).toHaveLength(0);
  });

  it.each([
    ['a user without membership', HOUSEHOLD_ID, OTHER_USER_ID],
    ['a nonexistent household', randomUUID(), USER_ID],
    ['the household creator without membership', HOUSEHOLD_ID, OTHER_USER_ID],
  ] as const)('returns the same 403 for %s', async (_caseName, householdId, requesterId) => {
    const { app, transactions } = createTestContext();
    transactions.records.push(storedTransaction({ createdBy: requesterId }));
    const token = await createToken(requesterId);

    const response = await getSummary(app, token, {}, householdId);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
  });

  it('excludes transactions from another household and preserves requester identity', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ type: 'income', amount: '10.00' }),
      storedTransaction({ householdId: OTHER_HOUSEHOLD_ID, type: 'income', amount: '999.00' }),
    );
    const token = await createToken(USER_ID);

    const response = await getSummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      totalIncome: '10.00',
      totalExpense: '0.00',
      balance: '10.00',
    });
    expect(transactions.summaryCalls[0]).toEqual({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
    });
  });

  it('returns 400 for an invalid household UUID', async () => {
    const { app, transactions } = createTestContext();
    const token = await createToken(USER_ID);

    const response = await getSummary(app, token, {}, 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
    });
    expect(transactions.summaryCalls).toHaveLength(0);
  });

  it('returns a sanitized 500 for an unexpected summary error', async () => {
    const transactions = new InMemoryTransactionRepository(
      undefined,
      undefined,
      undefined,
      undefined,
      new Error('sensitive summary database details'),
    );
    const { app } = createTestContext(transactions);
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await getSummary(app, token);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive summary database details');
  });
});

describe('GET /api/households/:householdId/summary/users', () => {
  const getUserSummary = (
    app: Express,
    token: string,
    query: Record<string, unknown> = {},
    householdId: string = HOUSEHOLD_ID,
  ) =>
    request(app)
      .get(`/api/households/${householdId}/summary/users`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);

  it.each(['owner', 'member'] as const)(
    'allows an authenticated %s to view the per-user summary',
    async (role) => {
      const { app, transactions } = createTestContext();
      grantMembership(transactions, role, USER_ID, HOUSEHOLD_ID, 'Harry');
      const token = await createToken(USER_ID);

      const response = await getUserSummary(app, token);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: [
          {
            userId: USER_ID,
            name: 'Harry',
            totalIncome: '0.00',
            totalExpense: '0.00',
            balance: '0.00',
            expenseSharePercentage: '0.00',
          },
        ],
      });
    },
  );

  it('returns every household member even when they have no transactions', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner', USER_ID, HOUSEHOLD_ID, 'Harry');
    grantMembership(transactions, 'member', OTHER_USER_ID, HOUSEHOLD_ID, 'Ana');
    transactions.records.push(
      storedTransaction({ createdBy: USER_ID, type: 'expense', amount: '100.00' }),
    );
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data).toContainEqual({
      userId: OTHER_USER_ID,
      name: 'Ana',
      totalIncome: '0.00',
      totalExpense: '0.00',
      balance: '0.00',
      expenseSharePercentage: '0.00',
    });
  });

  it('groups income and expense per createdBy, isolating each member from the others', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner', USER_ID, HOUSEHOLD_ID, 'Harry');
    grantMembership(transactions, 'member', OTHER_USER_ID, HOUSEHOLD_ID, 'Ana');
    transactions.records.push(
      storedTransaction({ createdBy: USER_ID, type: 'income', amount: '5000.00' }),
      storedTransaction({ createdBy: USER_ID, type: 'expense', amount: '2000.00' }),
      storedTransaction({ createdBy: OTHER_USER_ID, type: 'expense', amount: '1000.00' }),
    );
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      {
        userId: OTHER_USER_ID,
        name: 'Ana',
        totalIncome: '0.00',
        totalExpense: '1000.00',
        balance: '-1000.00',
        expenseSharePercentage: '33.33',
      },
      {
        userId: USER_ID,
        name: 'Harry',
        totalIncome: '5000.00',
        totalExpense: '2000.00',
        balance: '3000.00',
        expenseSharePercentage: '66.67',
      },
    ]);
  });

  it('keeps a member with zero transactions in the requested period instead of dropping the row', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner', USER_ID, HOUSEHOLD_ID, 'Harry');
    grantMembership(transactions, 'member', OTHER_USER_ID, HOUSEHOLD_ID, 'Ana');
    transactions.records.push(
      storedTransaction({
        createdBy: USER_ID,
        type: 'income',
        amount: '10.00',
        transactionDate: '2026-09-15',
      }),
    );
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token, {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data).toContainEqual({
      userId: OTHER_USER_ID,
      name: 'Ana',
      totalIncome: '0.00',
      totalExpense: '0.00',
      balance: '0.00',
      expenseSharePercentage: '0.00',
    });
  });

  it('returns 0.00 expenseSharePercentage for every member when the household has no expenses', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner', USER_ID, HOUSEHOLD_ID, 'Harry');
    grantMembership(transactions, 'member', OTHER_USER_ID, HOUSEHOLD_ID, 'Ana');
    transactions.records.push(
      storedTransaction({ createdBy: USER_ID, type: 'income', amount: '500.00' }),
    );
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token);

    expect(response.status).toBe(200);
    expect(
      response.body.data.map(
        (entry: { expenseSharePercentage: string }) => entry.expenseSharePercentage,
      ),
    ).toEqual(['0.00', '0.00']);
  });

  it('assigns 100.00 expenseSharePercentage to the only member with expenses', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner', USER_ID, HOUSEHOLD_ID, 'Harry');
    transactions.records.push(
      storedTransaction({ createdBy: USER_ID, type: 'expense', amount: '250.00' }),
    );
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data[0].expenseSharePercentage).toBe('100.00');
  });

  it('rounds a repeating-decimal expenseSharePercentage to two places', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner', USER_ID, HOUSEHOLD_ID, 'Harry');
    grantMembership(transactions, 'member', OTHER_USER_ID, HOUSEHOLD_ID, 'Ana');
    transactions.records.push(
      storedTransaction({ createdBy: USER_ID, type: 'expense', amount: '1000.00' }),
      storedTransaction({ createdBy: OTHER_USER_ID, type: 'expense', amount: '2000.00' }),
    );
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token);

    const percentages = response.body.data
      .map((entry: { expenseSharePercentage: string }) => entry.expenseSharePercentage)
      .sort();
    expect(percentages).toEqual(['33.33', '66.67']);
  });

  it('preserves large monetary values and decimal precision without floating-point conversion', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner', USER_ID, HOUSEHOLD_ID, 'Harry');
    transactions.records.push(
      storedTransaction({ createdBy: USER_ID, type: 'income', amount: '999999999900.10' }),
      storedTransaction({ createdBy: USER_ID, type: 'expense', amount: '0.07' }),
    );
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toEqual({
      userId: USER_ID,
      name: 'Harry',
      totalIncome: '999999999900.10',
      totalExpense: '0.07',
      balance: '999999999900.03',
      expenseSharePercentage: '100.00',
    });
  });

  it('includes transactions regardless of status or source', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner', USER_ID, HOUSEHOLD_ID, 'Harry');
    transactions.records.push(
      storedTransaction({
        createdBy: USER_ID,
        type: 'expense',
        amount: '1.00',
        status: 'pending',
        dueDate: '2026-09-12',
      }),
      storedTransaction({
        createdBy: USER_ID,
        type: 'expense',
        amount: '2.00',
        status: 'paid',
        paidAt: NOW,
        source: 'bank_import',
      }),
      storedTransaction({
        createdBy: USER_ID,
        type: 'expense',
        amount: '4.00',
        status: 'pending',
        dueDate: null,
      }),
    );
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ totalExpense: '7.00' });
  });

  it.each([
    ['only startDate', { startDate: '2026-09-10' }, '14.00'],
    ['only endDate', { endDate: '2026-09-20' }, '7.00'],
    ['inclusive startDate and endDate', { startDate: '2026-09-10', endDate: '2026-09-20' }, '6.00'],
  ] as const)(
    'applies %s to transactionDate for the per-user totals',
    async (_caseName, query, totalIncome) => {
      const { app, transactions } = createTestContext();
      grantMembership(transactions, 'owner', USER_ID, HOUSEHOLD_ID, 'Harry');
      transactions.records.push(
        storedTransaction({
          createdBy: USER_ID,
          type: 'income',
          amount: '1.00',
          transactionDate: '2026-09-01',
        }),
        storedTransaction({
          createdBy: USER_ID,
          type: 'income',
          amount: '2.00',
          transactionDate: '2026-09-10',
        }),
        storedTransaction({
          createdBy: USER_ID,
          type: 'income',
          amount: '4.00',
          transactionDate: '2026-09-20',
        }),
        storedTransaction({
          createdBy: USER_ID,
          type: 'income',
          amount: '8.00',
          transactionDate: '2026-09-30',
        }),
      );
      const token = await createToken(USER_ID);

      const response = await getUserSummary(app, token, query);

      expect(response.status).toBe(200);
      expect(response.body.data[0]).toMatchObject({ totalIncome, balance: totalIncome });
      expect(transactions.userSummaryCalls[0]).toMatchObject(query);
    },
  );

  it.each([
    ['an inverted range', { startDate: '2026-09-20', endDate: '2026-09-10' }],
    ['an invalid startDate', { startDate: '2026-02-30' }],
    ['an invalid endDate', { endDate: '13-09-2026' }],
    ['an unknown query', { status: 'paid' }],
  ])('returns 400 without querying the repository for %s', async (_caseName, query) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member', USER_ID, HOUSEHOLD_ID, 'Harry');
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token, query);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
    });
    expect(transactions.userSummaryCalls).toHaveLength(0);
  });

  it('returns 400 for an invalid household UUID', async () => {
    const { app, transactions } = createTestContext();
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token, {}, 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
    });
    expect(transactions.userSummaryCalls).toHaveLength(0);
  });

  it('returns 401 without Authorization', async () => {
    const { app, transactions } = createTestContext();

    const response = await request(app).get(`/api/households/${HOUSEHOLD_ID}/summary/users`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(transactions.userSummaryCalls).toHaveLength(0);
  });

  it.each([
    ['a user without membership', HOUSEHOLD_ID, OTHER_USER_ID],
    ['a nonexistent household', randomUUID(), USER_ID],
    ['the household creator without membership', HOUSEHOLD_ID, OTHER_USER_ID],
  ] as const)('returns the same 403 for %s', async (_caseName, householdId, requesterId) => {
    const { app, transactions } = createTestContext();
    transactions.records.push(storedTransaction({ createdBy: requesterId }));
    const token = await createToken(requesterId);

    const response = await getUserSummary(app, token, {}, householdId);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
  });

  it('excludes members and transactions from another household', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner', USER_ID, HOUSEHOLD_ID, 'Harry');
    grantMembership(
      transactions,
      'member',
      OTHER_USER_ID,
      OTHER_HOUSEHOLD_ID,
      'Cross Household User',
    );
    transactions.records.push(
      storedTransaction({ createdBy: USER_ID, type: 'income', amount: '10.00' }),
      storedTransaction({
        householdId: OTHER_HOUSEHOLD_ID,
        createdBy: OTHER_USER_ID,
        type: 'income',
        amount: '999.00',
      }),
    );
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      {
        userId: USER_ID,
        name: 'Harry',
        totalIncome: '10.00',
        totalExpense: '0.00',
        balance: '10.00',
        expenseSharePercentage: '0.00',
      },
    ]);
  });

  it('does not expose email or passwordHash and returns only the documented fields', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner', USER_ID, HOUSEHOLD_ID, 'Harry');
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token);

    expect(response.status).toBe(200);
    const entry = response.body.data[0];
    expect(entry).not.toHaveProperty('email');
    expect(entry).not.toHaveProperty('passwordHash');
    expect(entry).not.toHaveProperty('role');
    expect(Object.keys(entry).sort()).toEqual(
      ['balance', 'expenseSharePercentage', 'name', 'totalExpense', 'totalIncome', 'userId'].sort(),
    );
    expect(typeof entry.totalIncome).toBe('string');
    expect(typeof entry.totalExpense).toBe('string');
    expect(typeof entry.balance).toBe('string');
    expect(typeof entry.expenseSharePercentage).toBe('string');
  });

  it('returns a sanitized 500 for an unexpected user summary error', async () => {
    const transactions = new InMemoryTransactionRepository(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new Error('sensitive user summary database details'),
    );
    const { app } = createTestContext(transactions);
    grantMembership(transactions, 'member', USER_ID, HOUSEHOLD_ID, 'Harry');
    const token = await createToken(USER_ID);

    const response = await getUserSummary(app, token);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive user summary database details');
  });
});

describe('GET /api/households/:householdId/summary/categories', () => {
  const getCategorySummary = (
    app: Express,
    token: string,
    query: Record<string, unknown> = {},
    householdId: string = HOUSEHOLD_ID,
  ) =>
    request(app)
      .get(`/api/households/${householdId}/summary/categories`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);

  it.each(['owner', 'member'] as const)(
    'allows an authenticated %s to view an empty category summary',
    async (role) => {
      const { app, transactions } = createTestContext();
      grantMembership(transactions, role);
      const token = await createToken(USER_ID);

      const response = await getCategorySummary(app, token);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [] });
    },
  );

  it('groups expenses by category and sums each group', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ type: 'expense', amount: '100.00', categoryId: EXPENSE_CATEGORY_ID }),
      storedTransaction({ type: 'expense', amount: '50.00', categoryId: EXPENSE_CATEGORY_ID }),
    );
    const token = await createToken(USER_ID);

    const response = await getCategorySummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [{ categoryId: EXPENSE_CATEGORY_ID, categoryName: 'Mercado', totalExpense: '150.00' }],
    });
  });

  it('excludes income transactions from the category summary', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ type: 'expense', amount: '30.00', categoryId: EXPENSE_CATEGORY_ID }),
      storedTransaction({ type: 'income', amount: '5000.00', categoryId: INCOME_CATEGORY_ID }),
    );
    const token = await createToken(USER_ID);

    const response = await getCategorySummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { categoryId: EXPENSE_CATEGORY_ID, categoryName: 'Mercado', totalExpense: '30.00' },
    ]);
  });

  it('groups transactions with no category under "Sem categoria"', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ type: 'expense', amount: '20.00', categoryId: null }),
      storedTransaction({ type: 'expense', amount: '5.00', categoryId: null }),
    );
    const token = await createToken(USER_ID);

    const response = await getCategorySummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { categoryId: null, categoryName: 'Sem categoria', totalExpense: '25.00' },
    ]);
  });

  it('orders categories by total expense descending', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ type: 'expense', amount: '10.00', categoryId: EXPENSE_CATEGORY_ID }),
      storedTransaction({ type: 'expense', amount: '90.00', categoryId: null }),
    );
    const token = await createToken(USER_ID);

    const response = await getCategorySummary(app, token);

    expect(response.status).toBe(200);
    expect(
      response.body.data.map((entry: { categoryId: string | null }) => entry.categoryId),
    ).toEqual([null, EXPENSE_CATEGORY_ID]);
  });

  it('preserves decimal precision without floating-point conversion', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({
        type: 'expense',
        amount: '999999999900.10',
        categoryId: EXPENSE_CATEGORY_ID,
      }),
      storedTransaction({ type: 'expense', amount: '0.07', categoryId: EXPENSE_CATEGORY_ID }),
    );
    const token = await createToken(USER_ID);

    const response = await getCategorySummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { categoryId: EXPENSE_CATEGORY_ID, categoryName: 'Mercado', totalExpense: '999999999900.17' },
    ]);
  });

  it.each([
    ['only startDate', { startDate: '2026-09-10' }, '14.00'],
    ['only endDate', { endDate: '2026-09-20' }, '7.00'],
    ['inclusive startDate and endDate', { startDate: '2026-09-10', endDate: '2026-09-20' }, '6.00'],
  ] as const)('applies %s to transactionDate', async (_caseName, query, totalExpense) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ amount: '1.00', categoryId: null, transactionDate: '2026-09-01' }),
      storedTransaction({ amount: '2.00', categoryId: null, transactionDate: '2026-09-10' }),
      storedTransaction({ amount: '4.00', categoryId: null, transactionDate: '2026-09-20' }),
      storedTransaction({ amount: '8.00', categoryId: null, transactionDate: '2026-09-30' }),
    );
    const token = await createToken(USER_ID);

    const response = await getCategorySummary(app, token, query);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { categoryId: null, categoryName: 'Sem categoria', totalExpense },
    ]);
    expect(transactions.categorySummaryCalls[0]).toMatchObject(query);
  });

  it.each([
    ['an inverted range', { startDate: '2026-09-20', endDate: '2026-09-10' }],
    ['an invalid startDate', { startDate: '2026-02-30' }],
    ['an invalid endDate', { endDate: '13-09-2026' }],
    ['an unknown query', { status: 'paid' }],
  ])('returns 400 without querying the repository for %s', async (_caseName, query) => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await getCategorySummary(app, token, query);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
    });
    expect(transactions.categorySummaryCalls).toHaveLength(0);
  });

  it('returns 400 for an invalid household UUID', async () => {
    const { app, transactions } = createTestContext();
    const token = await createToken(USER_ID);

    const response = await getCategorySummary(app, token, {}, 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
    });
    expect(transactions.categorySummaryCalls).toHaveLength(0);
  });

  it('returns 401 without Authorization', async () => {
    const { app, transactions } = createTestContext();

    const response = await request(app).get(`/api/households/${HOUSEHOLD_ID}/summary/categories`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(transactions.categorySummaryCalls).toHaveLength(0);
  });

  it.each([
    ['a user without membership', HOUSEHOLD_ID, OTHER_USER_ID],
    ['a nonexistent household', randomUUID(), USER_ID],
    ['the household creator without membership', HOUSEHOLD_ID, OTHER_USER_ID],
  ] as const)('returns the same 403 for %s', async (_caseName, householdId, requesterId) => {
    const { app, transactions } = createTestContext();
    transactions.records.push(storedTransaction({ createdBy: requesterId }));
    const token = await createToken(requesterId);

    const response = await getCategorySummary(app, token, {}, householdId);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
  });

  it('excludes transactions and categories from another household', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ type: 'expense', amount: '10.00', categoryId: EXPENSE_CATEGORY_ID }),
      storedTransaction({
        householdId: OTHER_HOUSEHOLD_ID,
        type: 'expense',
        amount: '999.00',
        categoryId: CROSS_HOUSEHOLD_CATEGORY_ID,
      }),
    );
    const token = await createToken(USER_ID);

    const response = await getCategorySummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { categoryId: EXPENSE_CATEGORY_ID, categoryName: 'Mercado', totalExpense: '10.00' },
    ]);
    expect(transactions.categorySummaryCalls[0]).toEqual({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
    });
  });

  it('returns only the documented fields', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ type: 'expense', amount: '10.00', categoryId: EXPENSE_CATEGORY_ID }),
    );
    const token = await createToken(USER_ID);

    const response = await getCategorySummary(app, token);

    expect(response.status).toBe(200);
    const entry = response.body.data[0];
    expect(Object.keys(entry).sort()).toEqual(
      ['categoryId', 'categoryName', 'totalExpense'].sort(),
    );
    expect(typeof entry.categoryName).toBe('string');
    expect(typeof entry.totalExpense).toBe('string');
  });

  it('returns a sanitized 500 for an unexpected category summary error', async () => {
    const transactions = new InMemoryTransactionRepository(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new Error('sensitive category summary database details'),
    );
    const { app } = createTestContext(transactions);
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await getCategorySummary(app, token);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'sensitive category summary database details',
    );
  });
});

describe('GET /api/households/:householdId/summary/monthly', () => {
  const getMonthlySummary = (
    app: Express,
    token: string,
    query: Record<string, unknown> = {},
    householdId: string = HOUSEHOLD_ID,
  ) =>
    request(app)
      .get(`/api/households/${householdId}/summary/monthly`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);

  const EXPECTED_MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

  it.each(['owner', 'member'] as const)(
    'allows an authenticated %s to view an empty monthly summary with all six months zeroed',
    async (role) => {
      const { app, transactions } = createTestContext();
      grantMembership(transactions, role);
      const token = await createToken(USER_ID);

      const response = await getMonthlySummary(app, token);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: EXPECTED_MONTHS.map((month) => ({
          month,
          totalIncome: '0.00',
          totalExpense: '0.00',
          balance: '0.00',
        })),
      });
    },
  );

  it('includes the current month and orders the six months chronologically ascending', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await getMonthlySummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data.map((entry: { month: string }) => entry.month)).toEqual(
      EXPECTED_MONTHS,
    );
  });

  it('aggregates income, expense and balance per month, filling months without movement with zeros', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ type: 'income', amount: '1000.00', transactionDate: '2026-09-01' }),
      storedTransaction({ type: 'expense', amount: '700.00', transactionDate: '2026-09-13' }),
      storedTransaction({ type: 'income', amount: '500.00', transactionDate: '2026-08-05' }),
    );
    const token = await createToken(USER_ID);

    const response = await getMonthlySummary(app, token);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      { month: '2026-04', totalIncome: '0.00', totalExpense: '0.00', balance: '0.00' },
      { month: '2026-05', totalIncome: '0.00', totalExpense: '0.00', balance: '0.00' },
      { month: '2026-06', totalIncome: '0.00', totalExpense: '0.00', balance: '0.00' },
      { month: '2026-07', totalIncome: '0.00', totalExpense: '0.00', balance: '0.00' },
      { month: '2026-08', totalIncome: '500.00', totalExpense: '0.00', balance: '500.00' },
      { month: '2026-09', totalIncome: '1000.00', totalExpense: '700.00', balance: '300.00' },
    ]);
  });

  it('excludes transactions outside the six-month window', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ type: 'income', amount: '999.00', transactionDate: '2026-03-31' }),
    );
    const token = await createToken(USER_ID);

    const response = await getMonthlySummary(app, token);

    expect(response.status).toBe(200);
    expect(
      response.body.data.every((entry: { totalIncome: string }) => entry.totalIncome === '0.00'),
    ).toBe(true);
  });

  it('preserves decimal precision without floating-point conversion', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({
        type: 'income',
        amount: '999999999900.10',
        transactionDate: '2026-09-01',
      }),
      storedTransaction({ type: 'income', amount: '0.07', transactionDate: '2026-09-05' }),
    );
    const token = await createToken(USER_ID);

    const response = await getMonthlySummary(app, token);

    expect(response.status).toBe(200);
    const september = response.body.data.find(
      (entry: { month: string }) => entry.month === '2026-09',
    );
    expect(september).toEqual({
      month: '2026-09',
      totalIncome: '999999999900.17',
      totalExpense: '0.00',
      balance: '999999999900.17',
    });
  });

  it('returns 400 for an unknown query parameter', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await getMonthlySummary(app, token, { months: '12' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request query' },
    });
    expect(transactions.monthlySummaryCalls).toHaveLength(0);
  });

  it('returns 400 for an invalid household UUID', async () => {
    const { app, transactions } = createTestContext();
    const token = await createToken(USER_ID);

    const response = await getMonthlySummary(app, token, {}, 'not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
    });
    expect(transactions.monthlySummaryCalls).toHaveLength(0);
  });

  it('returns 401 without Authorization', async () => {
    const { app, transactions } = createTestContext();

    const response = await request(app).get(`/api/households/${HOUSEHOLD_ID}/summary/monthly`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(transactions.monthlySummaryCalls).toHaveLength(0);
  });

  it.each([
    ['a user without membership', HOUSEHOLD_ID, OTHER_USER_ID],
    ['a nonexistent household', randomUUID(), USER_ID],
  ] as const)('returns the same 403 for %s', async (_caseName, householdId, requesterId) => {
    const { app, transactions } = createTestContext();
    transactions.records.push(storedTransaction({ createdBy: requesterId }));
    const token = await createToken(requesterId);

    const response = await getMonthlySummary(app, token, {}, householdId);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
  });

  it('excludes transactions from another household', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    transactions.records.push(
      storedTransaction({ type: 'income', amount: '10.00', transactionDate: '2026-09-01' }),
      storedTransaction({
        householdId: OTHER_HOUSEHOLD_ID,
        type: 'income',
        amount: '999.00',
        transactionDate: '2026-09-01',
      }),
    );
    const token = await createToken(USER_ID);

    const response = await getMonthlySummary(app, token);

    expect(response.status).toBe(200);
    const september = response.body.data.find(
      (entry: { month: string }) => entry.month === '2026-09',
    );
    expect(september.totalIncome).toBe('10.00');
    expect(transactions.monthlySummaryCalls[0]).toEqual({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      months: EXPECTED_MONTHS,
    });
  });

  it('queries the repository exactly once for the whole window', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await getMonthlySummary(app, token);

    expect(response.status).toBe(200);
    expect(transactions.monthlySummaryCalls).toHaveLength(1);
  });

  it('returns only the documented fields', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await getMonthlySummary(app, token);

    expect(response.status).toBe(200);
    const entry = response.body.data[0];
    expect(Object.keys(entry).sort()).toEqual(['balance', 'month', 'totalExpense', 'totalIncome']);
  });

  it('returns a sanitized 500 for an unexpected monthly summary error', async () => {
    const transactions = new InMemoryTransactionRepository(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new Error('sensitive monthly summary database details'),
    );
    const { app } = createTestContext(transactions);
    grantMembership(transactions, 'member');
    const token = await createToken(USER_ID);

    const response = await getMonthlySummary(app, token);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'sensitive monthly summary database details',
    );
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

  it('changes expenseNature from fixed to variable', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction({ expenseNature: 'fixed' });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { expenseNature: 'variable' });

    expect(response.status).toBe(200);
    expect(response.body.data.expenseNature).toBe('variable');
    expect(transactions.records[0]?.expenseNature).toBe('variable');
  });

  it('changes expenseNature from variable to fixed', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction({ expenseNature: 'variable' });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { expenseNature: 'fixed' });

    expect(response.status).toBe(200);
    expect(response.body.data.expenseNature).toBe('fixed');
  });

  it('clears expenseNature with an explicit null', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction({ expenseNature: 'fixed' });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { expenseNature: null });

    expect(response.status).toBe(200);
    expect(response.body.data.expenseNature).toBeNull();
    expect(transactions.records[0]?.expenseNature).toBeNull();
  });

  it('automatically clears expenseNature when an expense becomes an income', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction({ categoryId: null, expenseNature: 'fixed' });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { type: 'income' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ type: 'income', expenseNature: null });
    expect(transactions.records[0]?.expenseNature).toBeNull();
  });

  it('keeps expenseNature null when an income becomes an expense without specifying it', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction({
      type: 'income',
      categoryId: null,
      expenseNature: null,
    });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { type: 'expense' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ type: 'expense', expenseNature: null });
  });

  it('returns 400 when type=income and expenseNature are sent together', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction();
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, {
      type: 'income',
      categoryId: null,
      expenseNature: 'fixed',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request payload' },
    });
    expect(transactions.updateCalls).toHaveLength(0);
  });

  it('returns INVALID_EXPENSE_NATURE when expenseNature is set alone on a stored income transaction', async () => {
    const { app, transactions } = createTestContext();
    grantMembership(transactions, 'owner');
    const existing = storedTransaction({
      type: 'income',
      categoryId: null,
      expenseNature: null,
    });
    transactions.records.push(existing);
    const token = await createToken(USER_ID);

    const response = await patch(app, token, existing.id, { expenseNature: 'fixed' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_EXPENSE_NATURE',
        message: 'expenseNature is only allowed for expense transactions',
      },
    });
    expect(transactions.records[0]?.expenseNature).toBeNull();
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
    ['an invalid expenseNature', { expenseNature: 'half' }],
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
      expenseNature: null,
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

  it.each(['fixed', 'variable', null] as const)(
    'persists expenseNature=%s on insert',
    async (expenseNature) => {
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
        create(_entity: unknown, data: Record<string, unknown>): TransactionEntity {
          createdData = data;
          return Object.assign(new TransactionEntity(), data);
        },
        async save(entity: TransactionEntity): Promise<TransactionEntity> {
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
      const repository = new TypeOrmTransactionRepository(dataSource);

      const result = await repository.createAsMember({
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
        expenseNature,
      });

      expect(createdData).toMatchObject({ expenseNature });
      expect(result.expenseNature).toBe(expenseNature);
    },
  );

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
        expenseNature: null,
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
      expenseNature: null,
      recurringTransactionId: null,
      recurringPeriod: null,
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
    expect(query.addSelect).toHaveBeenCalledTimes(15);
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
          expenseNature: null,
          recurringTransactionId: null,
          recurringPeriod: null,
          createdBy: OTHER_USER_ID,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      total: 7,
    });
  });

  it.each([
    [undefined, 'ASC'],
    ['asc', 'ASC'],
    ['desc', 'DESC'],
  ] as const)(
    'orders by due_date NULLS LAST (with sortOrder=%s) when sortBy is dueDate',
    async (sortOrder, direction) => {
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
      const getRepository = jest.fn((entity: unknown) =>
        entity === HouseholdMemberEntity ? { findOne: membershipFindOne } : { createQueryBuilder },
      );
      const dataSource = { getRepository, transaction: jest.fn() } as unknown as DataSource;
      const repository = new TypeOrmTransactionRepository(dataSource);

      await repository.listAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        page: 1,
        limit: 20,
        today: TODAY,
        sortBy: 'dueDate',
        ...(sortOrder === undefined ? {} : { sortOrder }),
      });

      expect(query.orderBy).toHaveBeenCalledWith('transaction.due_date', direction, 'NULLS LAST');
      expect(query.addOrderBy.mock.calls).toEqual([
        ['transaction.created_at', direction],
        ['transaction.id', direction],
      ]);
    },
  );

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

  it('aggregates a scoped summary after membership without loading transactions or locking', async () => {
    const events: string[] = [];
    const query = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => {
        events.push('aggregate');
        return {
          totalIncome: '999999999999.99',
          totalExpense: '0',
          balance: '-0.1',
        };
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
      throw new Error('getSummaryAsMember must not open a transaction');
    });
    const getRepository = jest.fn((entity: unknown) =>
      entity === HouseholdMemberEntity ? { findOne: membershipFindOne } : { createQueryBuilder },
    );
    const dataSource = { getRepository, transaction } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    const result = await repository.getSummaryAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });

    expect(events).toEqual(['membership', 'queryBuilder', 'aggregate']);
    expect(membershipFindOne).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        household: { id: HOUSEHOLD_ID },
        user: { id: USER_ID },
      },
    });
    expect(membershipFindOne.mock.calls[0]?.[0]).not.toHaveProperty('lock');
    expect(query.select.mock.calls[0]?.[0]).toContain("SUM(CASE WHEN transaction.type = 'income'");
    expect(query.select.mock.calls[0]?.[0]).toContain('COALESCE');
    expect(query.select.mock.calls[0]?.[1]).toBe('totalIncome');
    expect(query.addSelect.mock.calls[0]?.[0]).toContain(
      "SUM(CASE WHEN transaction.type = 'expense'",
    );
    expect(query.addSelect.mock.calls[0]?.[1]).toBe('totalExpense');
    expect(query.addSelect.mock.calls[1]?.[0]).toContain(
      "WHEN transaction.type = 'expense' THEN -transaction.amount",
    );
    expect(query.addSelect.mock.calls[1]?.[1]).toBe('balance');
    expect(query.where).toHaveBeenCalledWith('transaction.household_id = :householdId', {
      householdId: HOUSEHOLD_ID,
    });
    expect(query.andWhere.mock.calls[0]?.[0]).toContain('FROM household_members');
    expect(query.andWhere.mock.calls[0]?.[1]).toEqual({ requesterId: USER_ID });
    expect(query.andWhere.mock.calls.slice(1)).toEqual([
      ['transaction.transaction_date >= :startDate', { startDate: '2026-09-01' }],
      ['transaction.transaction_date <= :endDate', { endDate: '2026-09-30' }],
    ]);
    expect(query.getRawOne).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveProperty('getMany');
    expect(query).not.toHaveProperty('setLock');
    expect(transaction).not.toHaveBeenCalled();
    expect(result).toEqual({
      totalIncome: '999999999999.99',
      totalExpense: '0.00',
      balance: '-0.10',
    });
  });

  it.each([
    ['null', null, '0.00'],
    ['zero', '0', '0.00'],
    ['negative zero', '-0', '0.00'],
    ['integer', '10', '10.00'],
    ['one decimal place', '10.5', '10.50'],
    ['two decimal places', '10.50', '10.50'],
    ['large value', '999999999999.99', '999999999999.99'],
  ] as const)(
    'normalizes a %s aggregate without floating-point conversion',
    async (_caseName, aggregate, normalized) => {
      const query = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(async () => ({
          totalIncome: aggregate,
          totalExpense: aggregate,
          balance: aggregate,
        })),
      };
      const membershipFindOne = jest.fn(async () => new HouseholdMemberEntity());
      const createQueryBuilder = jest.fn(() => query);
      const getRepository = jest.fn((entity: unknown) =>
        entity === HouseholdMemberEntity ? { findOne: membershipFindOne } : { createQueryBuilder },
      );
      const dataSource = { getRepository } as unknown as DataSource;
      const repository = new TypeOrmTransactionRepository(dataSource);

      const result = await repository.getSummaryAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
      });

      expect(result).toEqual({
        totalIncome: normalized,
        totalExpense: normalized,
        balance: normalized,
      });
    },
  );

  it('does not use household createdBy or aggregate when membership is absent', async () => {
    const membershipFindOne = jest.fn(async () => null);
    const householdFindOne = jest.fn(async () =>
      Object.assign(new HouseholdEntity(), {
        id: HOUSEHOLD_ID,
        createdBy: Object.assign(new UserEntity(), { id: USER_ID }),
      }),
    );
    const createQueryBuilder = jest.fn();
    const transaction = jest.fn();
    const getRepository = jest.fn((entity: unknown) => {
      if (entity === HouseholdMemberEntity) {
        return { findOne: membershipFindOne };
      }

      if (entity === HouseholdEntity) {
        return { findOne: householdFindOne };
      }

      return { createQueryBuilder };
    });
    const dataSource = { getRepository, transaction } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await expect(
      repository.getSummaryAsMember({ householdId: HOUSEHOLD_ID, requesterId: USER_ID }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(membershipFindOne).toHaveBeenCalledTimes(1);
    expect(getRepository).toHaveBeenCalledTimes(1);
    expect(getRepository).not.toHaveBeenCalledWith(HouseholdEntity);
    expect(householdFindOne).not.toHaveBeenCalled();
    expect(createQueryBuilder).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('aggregates a scoped per-user summary in a single member query plus a single household-total query, without loading transactions or locking', async () => {
    const events: string[] = [];
    const memberQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => {
        events.push('members');
        return [
          {
            userId: USER_ID,
            name: 'Harry',
            totalIncome: '5000.00',
            totalExpense: '2000.00',
            balance: '3000.00',
          },
          {
            userId: OTHER_USER_ID,
            name: 'Ana',
            totalIncome: '0',
            totalExpense: '1000.00',
            balance: '-1000.00',
          },
        ];
      }),
    };
    const totalExpenseQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => {
        events.push('householdTotal');
        return { totalExpense: '3000.00' };
      }),
    };
    const membershipFindOne = jest.fn(async (options: unknown) => {
      events.push('membership');
      return Object.assign(new HouseholdMemberEntity(), { id: randomUUID(), options });
    });
    const memberCreateQueryBuilder = jest.fn(() => {
      events.push('memberQueryBuilder');
      return memberQuery;
    });
    const transactionCreateQueryBuilder = jest.fn(() => {
      events.push('transactionQueryBuilder');
      return totalExpenseQuery;
    });
    const transaction = jest.fn(async () => {
      throw new Error('getUserSummaryAsMember must not open a transaction');
    });
    const getRepository = jest.fn((entity: unknown) =>
      entity === HouseholdMemberEntity
        ? { findOne: membershipFindOne, createQueryBuilder: memberCreateQueryBuilder }
        : { createQueryBuilder: transactionCreateQueryBuilder },
    );
    const dataSource = { getRepository, transaction } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    const result = await repository.getUserSummaryAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });

    expect(events).toEqual([
      'membership',
      'memberQueryBuilder',
      'members',
      'transactionQueryBuilder',
      'householdTotal',
    ]);
    expect(membershipFindOne).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        household: { id: HOUSEHOLD_ID },
        user: { id: USER_ID },
      },
    });
    expect(membershipFindOne.mock.calls[0]?.[0]).not.toHaveProperty('lock');

    expect(memberCreateQueryBuilder).toHaveBeenCalledTimes(1);
    expect(memberCreateQueryBuilder).toHaveBeenCalledWith('member');
    expect(memberQuery.innerJoin).toHaveBeenCalledWith('member.user', 'user');
    expect(memberQuery.leftJoin).toHaveBeenCalledTimes(1);
    expect(memberQuery.leftJoin.mock.calls[0]?.[0]).toBe(TransactionEntity);
    expect(memberQuery.leftJoin.mock.calls[0]?.[1]).toBe('transaction');
    const joinCondition = memberQuery.leftJoin.mock.calls[0]?.[2] as string;
    expect(joinCondition).toContain('transaction.household_id = member.household_id');
    expect(joinCondition).toContain('transaction.created_by = member.user_id');
    expect(joinCondition).toContain('transaction.transaction_date >= :userSummaryStartDate');
    expect(joinCondition).toContain('transaction.transaction_date <= :userSummaryEndDate');
    expect(memberQuery.leftJoin.mock.calls[0]?.[3]).toEqual({
      userSummaryStartDate: '2026-09-01',
      userSummaryEndDate: '2026-09-30',
    });
    expect(memberQuery.select).toHaveBeenCalledWith('member.user_id', 'userId');
    expect(memberQuery.addSelect.mock.calls[0]).toEqual(['user.name', 'name']);
    expect(memberQuery.addSelect.mock.calls[1]?.[0]).toContain(
      "SUM(CASE WHEN transaction.type = 'income'",
    );
    expect(memberQuery.addSelect.mock.calls[1]?.[1]).toBe('totalIncome');
    expect(memberQuery.addSelect.mock.calls[2]?.[0]).toContain(
      "SUM(CASE WHEN transaction.type = 'expense'",
    );
    expect(memberQuery.addSelect.mock.calls[2]?.[1]).toBe('totalExpense');
    expect(memberQuery.addSelect.mock.calls[3]?.[1]).toBe('balance');
    expect(memberQuery.where).toHaveBeenCalledWith('member.household_id = :householdId', {
      householdId: HOUSEHOLD_ID,
    });
    expect(memberQuery.andWhere).not.toHaveBeenCalled();
    expect(memberQuery.groupBy).toHaveBeenCalledWith('member.user_id');
    expect(memberQuery.addGroupBy).toHaveBeenCalledWith('user.name');
    expect(memberQuery.orderBy).toHaveBeenCalledWith('user.name', 'ASC');
    expect(memberQuery.addOrderBy).toHaveBeenCalledWith('member.user_id', 'ASC');
    expect(memberQuery.getRawMany).toHaveBeenCalledTimes(1);
    expect(memberQuery).not.toHaveProperty('getMany');
    expect(memberQuery).not.toHaveProperty('setLock');

    expect(transactionCreateQueryBuilder).toHaveBeenCalledTimes(1);
    expect(transactionCreateQueryBuilder).toHaveBeenCalledWith('transaction');
    expect(totalExpenseQuery.where).toHaveBeenCalledWith(
      'transaction.household_id = :householdId',
      { householdId: HOUSEHOLD_ID },
    );
    expect(totalExpenseQuery.andWhere.mock.calls).toEqual([
      ['transaction.transaction_date >= :startDate', { startDate: '2026-09-01' }],
      ['transaction.transaction_date <= :endDate', { endDate: '2026-09-30' }],
    ]);
    expect(totalExpenseQuery.getRawOne).toHaveBeenCalledTimes(1);
    expect(totalExpenseQuery).not.toHaveProperty('setLock');

    expect(transaction).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        userId: USER_ID,
        name: 'Harry',
        totalIncome: '5000.00',
        totalExpense: '2000.00',
        balance: '3000.00',
        expenseSharePercentage: '66.67',
      },
      {
        userId: OTHER_USER_ID,
        name: 'Ana',
        totalIncome: '0.00',
        totalExpense: '1000.00',
        balance: '-1000.00',
        expenseSharePercentage: '33.33',
      },
    ]);
  });

  it('omits period parameters from the transaction join and household-total query when no dates are given', async () => {
    const memberQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => []),
    };
    const totalExpenseQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({ totalExpense: '0' })),
    };
    const membershipFindOne = jest.fn(async () => new HouseholdMemberEntity());
    const getRepository = jest.fn((entity: unknown) =>
      entity === HouseholdMemberEntity
        ? {
            findOne: membershipFindOne,
            createQueryBuilder: jest.fn(() => memberQuery),
          }
        : { createQueryBuilder: jest.fn(() => totalExpenseQuery) },
    );
    const dataSource = { getRepository } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await repository.getUserSummaryAsMember({ householdId: HOUSEHOLD_ID, requesterId: USER_ID });

    const joinCondition = memberQuery.leftJoin.mock.calls[0]?.[2] as string;
    expect(joinCondition).toBe(
      'transaction.household_id = member.household_id AND transaction.created_by = member.user_id',
    );
    expect(memberQuery.leftJoin.mock.calls[0]?.[3]).toEqual({});
    expect(totalExpenseQuery.andWhere).not.toHaveBeenCalled();
  });

  it('does not run per-member queries: exactly one member query and one household-total query regardless of member count', async () => {
    const memberQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () =>
        Array.from({ length: 5 }, (_unused, index) => ({
          userId: randomUUID(),
          name: `Member ${index}`,
          totalIncome: '0',
          totalExpense: '0',
          balance: '0',
        })),
      ),
    };
    const totalExpenseQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({ totalExpense: '0' })),
    };
    const membershipFindOne = jest.fn(async () => new HouseholdMemberEntity());
    const memberCreateQueryBuilder = jest.fn(() => memberQuery);
    const transactionCreateQueryBuilder = jest.fn(() => totalExpenseQuery);
    const getRepository = jest.fn((entity: unknown) =>
      entity === HouseholdMemberEntity
        ? { findOne: membershipFindOne, createQueryBuilder: memberCreateQueryBuilder }
        : { createQueryBuilder: transactionCreateQueryBuilder },
    );
    const dataSource = { getRepository } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    const result = await repository.getUserSummaryAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
    });

    expect(result).toHaveLength(5);
    expect(memberCreateQueryBuilder).toHaveBeenCalledTimes(1);
    expect(transactionCreateQueryBuilder).toHaveBeenCalledTimes(1);
    expect(memberQuery.getRawMany).toHaveBeenCalledTimes(1);
    expect(totalExpenseQuery.getRawOne).toHaveBeenCalledTimes(1);
  });

  it('does not query members or the household total when membership is absent', async () => {
    const membershipFindOne = jest.fn(async () => null);
    const memberCreateQueryBuilder = jest.fn();
    const transactionCreateQueryBuilder = jest.fn();
    const transaction = jest.fn();
    const getRepository = jest.fn((entity: unknown) =>
      entity === HouseholdMemberEntity
        ? { findOne: membershipFindOne, createQueryBuilder: memberCreateQueryBuilder }
        : { createQueryBuilder: transactionCreateQueryBuilder },
    );
    const dataSource = { getRepository, transaction } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await expect(
      repository.getUserSummaryAsMember({ householdId: HOUSEHOLD_ID, requesterId: USER_ID }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(membershipFindOne).toHaveBeenCalledTimes(1);
    expect(memberCreateQueryBuilder).not.toHaveBeenCalled();
    expect(transactionCreateQueryBuilder).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('returns 0.00 for the expenseSharePercentage instead of dividing by zero when the household has no expenses', async () => {
    const memberQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => [
        {
          userId: USER_ID,
          name: 'Harry',
          totalIncome: '500.00',
          totalExpense: '0',
          balance: '500.00',
        },
      ]),
    };
    const totalExpenseQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({ totalExpense: null })),
    };
    const membershipFindOne = jest.fn(async () => new HouseholdMemberEntity());
    const getRepository = jest.fn((entity: unknown) =>
      entity === HouseholdMemberEntity
        ? { findOne: membershipFindOne, createQueryBuilder: jest.fn(() => memberQuery) }
        : { createQueryBuilder: jest.fn(() => totalExpenseQuery) },
    );
    const dataSource = { getRepository } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    const result = await repository.getUserSummaryAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
    });

    expect(result).toEqual([
      {
        userId: USER_ID,
        name: 'Harry',
        totalIncome: '500.00',
        totalExpense: '0.00',
        balance: '500.00',
        expenseSharePercentage: '0.00',
      },
    ]);
  });

  it('does not use Number, parseFloat, parseInt, or Math in the per-user summary financial path', () => {
    const sourcePath = fileURLToPath(
      new URL('../src/repositories/transaction-repository.ts', import.meta.url),
    );
    const source = readFileSync(sourcePath, 'utf8');
    const methodStart = source.indexOf('async getUserSummaryAsMember(');
    const percentageHelperStart = source.indexOf('function computeExpenseSharePercentage(');
    const centsHelperStart = source.indexOf('function toBigIntCents(');

    expect(methodStart).toBeGreaterThan(-1);
    expect(percentageHelperStart).toBeGreaterThan(-1);
    expect(centsHelperStart).toBeGreaterThan(-1);

    const methodEnd = source.indexOf('\n  async getCategorySummaryAsMember(', methodStart);
    const financialPath = [
      source.slice(centsHelperStart, centsHelperStart + 400),
      source.slice(percentageHelperStart, percentageHelperStart + 900),
      source.slice(methodStart, methodEnd),
    ].join('\n');

    expect(financialPath).not.toMatch(/\bNumber\(/);
    expect(financialPath).not.toMatch(/\bparseFloat\(/);
    expect(financialPath).not.toMatch(/\bparseInt\(/);
    expect(financialPath).not.toMatch(/\bMath\./);
  });

  it('aggregates a scoped category summary after membership without loading transactions or locking', async () => {
    const events: string[] = [];
    const query = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => {
        events.push('aggregate');
        return [
          { categoryId: EXPENSE_CATEGORY_ID, categoryName: 'Mercado', totalExpense: '150.00' },
          { categoryId: null, categoryName: 'Sem categoria', totalExpense: '10.5' },
        ];
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
      throw new Error('getCategorySummaryAsMember must not open a transaction');
    });
    const getRepository = jest.fn((entity: unknown) =>
      entity === HouseholdMemberEntity ? { findOne: membershipFindOne } : { createQueryBuilder },
    );
    const dataSource = { getRepository, transaction } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    const result = await repository.getCategorySummaryAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });

    expect(events).toEqual(['membership', 'queryBuilder', 'aggregate']);
    expect(membershipFindOne.mock.calls[0]?.[0]).not.toHaveProperty('lock');
    expect(query.leftJoin).toHaveBeenCalledWith('transaction.category', 'category');
    expect(query.select).toHaveBeenCalledWith('transaction.category_id', 'categoryId');
    expect(query.addSelect.mock.calls[0]).toEqual([
      "COALESCE(category.name, 'Sem categoria')",
      'categoryName',
    ]);
    expect(query.addSelect.mock.calls[1]?.[0]).toContain('SUM(transaction.amount)');
    expect(query.addSelect.mock.calls[1]?.[1]).toBe('totalExpense');
    expect(query.where).toHaveBeenCalledWith('transaction.household_id = :householdId', {
      householdId: HOUSEHOLD_ID,
    });
    expect(query.andWhere.mock.calls[0]).toEqual(['transaction.type = :type', { type: 'expense' }]);
    expect(query.andWhere.mock.calls[1]?.[0]).toContain('FROM household_members');
    expect(query.andWhere.mock.calls[1]?.[1]).toEqual({ requesterId: USER_ID });
    expect(query.andWhere.mock.calls.slice(2)).toEqual([
      ['transaction.transaction_date >= :startDate', { startDate: '2026-09-01' }],
      ['transaction.transaction_date <= :endDate', { endDate: '2026-09-30' }],
    ]);
    expect(query.groupBy).toHaveBeenCalledWith('transaction.category_id');
    expect(query.addGroupBy).toHaveBeenCalledWith('category.name');
    expect(query.orderBy).toHaveBeenCalledTimes(1);
    expect(query.getRawMany).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveProperty('setLock');
    expect(transaction).not.toHaveBeenCalled();
    expect(result).toEqual([
      { categoryId: EXPENSE_CATEGORY_ID, categoryName: 'Mercado', totalExpense: '150.00' },
      { categoryId: null, categoryName: 'Sem categoria', totalExpense: '10.50' },
    ]);
  });

  it('does not query categories when membership is absent', async () => {
    const membershipFindOne = jest.fn(async () => null);
    const createQueryBuilder = jest.fn();
    const transaction = jest.fn();
    const getRepository = jest.fn((entity: unknown) =>
      entity === HouseholdMemberEntity ? { findOne: membershipFindOne } : { createQueryBuilder },
    );
    const dataSource = { getRepository, transaction } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await expect(
      repository.getCategorySummaryAsMember({ householdId: HOUSEHOLD_ID, requesterId: USER_ID }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(membershipFindOne).toHaveBeenCalledTimes(1);
    expect(getRepository).toHaveBeenCalledTimes(1);
    expect(createQueryBuilder).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('aggregates a scoped monthly summary via a single raw query after membership, without loading transactions, locking, or opening a transaction', async () => {
    const events: string[] = [];
    const membershipFindOne = jest.fn(async (options: unknown) => {
      events.push('membership');
      return Object.assign(new HouseholdMemberEntity(), { id: randomUUID(), options });
    });
    const query = jest.fn(async (_sql: string, _parameters: unknown[]) => {
      events.push('query');
      return [
        { month: '2026-04', totalIncome: '0', totalExpense: '0', balance: '0' },
        { month: '2026-09', totalIncome: '1000.5', totalExpense: '400', balance: '600.5' },
      ];
    });
    const transaction = jest.fn(async () => {
      throw new Error('getMonthlySummaryAsMember must not open a transaction');
    });
    const getRepository = jest.fn((entity: unknown) =>
      entity === HouseholdMemberEntity ? { findOne: membershipFindOne } : {},
    );
    const dataSource = { getRepository, query, transaction } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);
    const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

    const result = await repository.getMonthlySummaryAsMember({
      householdId: HOUSEHOLD_ID,
      requesterId: USER_ID,
      months,
    });

    expect(events).toEqual(['membership', 'query']);
    expect(membershipFindOne.mock.calls[0]?.[0]).not.toHaveProperty('lock');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('unnest($2::text[])');
    expect(sql).toContain('GROUP BY month_series.month');
    expect(sql).toContain('LEFT JOIN transactions');
    expect(parameters).toEqual([HOUSEHOLD_ID, months, USER_ID]);
    expect(transaction).not.toHaveBeenCalled();
    expect(result).toEqual([
      { month: '2026-04', totalIncome: '0.00', totalExpense: '0.00', balance: '0.00' },
      { month: '2026-09', totalIncome: '1000.50', totalExpense: '400.00', balance: '600.50' },
    ]);
  });

  it('does not query the monthly summary when membership is absent', async () => {
    const membershipFindOne = jest.fn(async () => null);
    const query = jest.fn();
    const transaction = jest.fn();
    const getRepository = jest.fn((entity: unknown) =>
      entity === HouseholdMemberEntity ? { findOne: membershipFindOne } : {},
    );
    const dataSource = { getRepository, query, transaction } as unknown as DataSource;
    const repository = new TypeOrmTransactionRepository(dataSource);

    await expect(
      repository.getMonthlySummaryAsMember({
        householdId: HOUSEHOLD_ID,
        requesterId: USER_ID,
        months: ['2026-09'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(membershipFindOne).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
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

  it('sets expenseNature on an expense-to-expense update', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const existing = Object.assign(new TransactionEntity(), {
      id: randomUUID(),
      type: 'expense',
      amount: '10.00',
      transactionDate: '2026-09-13',
      dueDate: null,
      description: null,
      status: 'pending',
      paidAt: null,
      source: 'manual',
      externalId: null,
      expenseNature: 'fixed',
      createdAt: NOW,
      category: null,
      createdBy: Object.assign(new UserEntity(), { id: USER_ID }),
    });
    let savedFields: Record<string, unknown> = {};
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity ? membership : existing;
      },
      async save(entity: TransactionEntity): Promise<TransactionEntity> {
        savedFields = { ...entity };
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
      expenseNature: 'variable',
    });

    expect(savedFields).toMatchObject({ expenseNature: 'variable' });
    expect(result.expenseNature).toBe('variable');
  });

  it('automatically clears expenseNature when the final type becomes income', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const existing = Object.assign(new TransactionEntity(), {
      id: randomUUID(),
      type: 'expense',
      amount: '10.00',
      transactionDate: '2026-09-13',
      dueDate: null,
      description: null,
      status: 'pending',
      paidAt: null,
      source: 'manual',
      externalId: null,
      expenseNature: 'fixed',
      createdAt: NOW,
      category: null,
      createdBy: Object.assign(new UserEntity(), { id: USER_ID }),
    });
    let savedFields: Record<string, unknown> = {};
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity ? membership : existing;
      },
      async save(entity: TransactionEntity): Promise<TransactionEntity> {
        savedFields = { ...entity };
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
      type: 'income',
    });

    expect(savedFields).toMatchObject({ expenseNature: null });
    expect(result.expenseNature).toBeNull();
  });

  it('keeps expenseNature null when the final type becomes expense without specifying it', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const existing = Object.assign(new TransactionEntity(), {
      id: randomUUID(),
      type: 'income',
      amount: '10.00',
      transactionDate: '2026-09-13',
      dueDate: null,
      description: null,
      status: 'pending',
      paidAt: null,
      source: 'manual',
      externalId: null,
      expenseNature: null,
      createdAt: NOW,
      category: null,
      createdBy: Object.assign(new UserEntity(), { id: USER_ID }),
    });
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity ? membership : existing;
      },
      async save(entity: TransactionEntity): Promise<TransactionEntity> {
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
      type: 'expense',
    });

    expect(result.expenseNature).toBeNull();
  });

  it('rejects an explicit expenseNature when the final type is income, without saving', async () => {
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const existing = Object.assign(new TransactionEntity(), {
      id: randomUUID(),
      type: 'income',
      amount: '10.00',
      transactionDate: '2026-09-13',
      dueDate: null,
      description: null,
      status: 'pending',
      paidAt: null,
      source: 'manual',
      externalId: null,
      expenseNature: null,
      createdAt: NOW,
      category: null,
      createdBy: Object.assign(new UserEntity(), { id: USER_ID }),
    });
    let saveCalls = 0;
    const manager = {
      async findOne(entity: unknown): Promise<object | null> {
        return entity === HouseholdMemberEntity ? membership : existing;
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
        expenseNature: 'fixed',
      }),
    ).rejects.toBeInstanceOf(InvalidExpenseNatureError);
    expect(saveCalls).toBe(0);
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
