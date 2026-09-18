import type { DataSource } from 'typeorm';

import { CategoryEntity } from '../database/entities/category.entity.js';
import { HouseholdMemberEntity } from '../database/entities/household-member.entity.js';
import { TransactionEntity } from '../database/entities/transaction.entity.js';
import { ForbiddenError } from '../errors/forbidden-error.js';
import { InvalidCategoryError } from '../errors/invalid-category-error.js';
import { InvalidExpenseNatureError } from '../errors/invalid-expense-nature-error.js';
import { TransactionAlreadyPaidError } from '../errors/transaction-already-paid-error.js';
import { TransactionNotFoundError } from '../errors/transaction-not-found-error.js';

export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'pending' | 'paid';
export type TransactionState = 'pending' | 'overdue';
export type TransactionSource = 'manual' | 'bank_import' | 'recurring';
export type TransactionExpenseNature = 'fixed' | 'variable';
export type TransactionSortBy = 'dueDate';
export type TransactionSortOrder = 'asc' | 'desc';

export interface TransactionRecord {
  id: string;
  type: TransactionType;
  amount: string;
  transactionDate: string;
  dueDate: string | null;
  categoryId: string | null;
  description: string | null;
  status: TransactionStatus;
  paidAt: Date | null;
  source: TransactionSource;
  expenseNature: TransactionExpenseNature | null;
  recurringTransactionId: string | null;
  recurringPeriod: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTransactionData {
  householdId: string;
  requesterId: string;
  type: TransactionType;
  amount: string;
  transactionDate: string;
  dueDate: string | null;
  categoryId: string | null;
  description: string | null;
  status: TransactionStatus;
  paidAt: Date | null;
  expenseNature: TransactionExpenseNature | null;
}

export interface ListTransactionsData {
  householdId: string;
  requesterId: string;
  type?: TransactionType;
  status?: TransactionStatus;
  state?: TransactionState;
  categoryId?: string;
  createdBy?: string;
  expenseNature?: TransactionExpenseNature;
  recurringTransactionId?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
  today: string;
  sortBy?: TransactionSortBy;
  sortOrder?: TransactionSortOrder;
}

export interface ListTransactionsResult {
  records: TransactionRecord[];
  total: number;
}

export interface GetHouseholdSummaryData {
  householdId: string;
  requesterId: string;
  startDate?: string;
  endDate?: string;
}

export interface HouseholdSummary {
  totalIncome: string;
  totalExpense: string;
  balance: string;
}

export interface GetHouseholdUserSummaryData {
  householdId: string;
  requesterId: string;
  startDate?: string;
  endDate?: string;
}

export interface HouseholdUserSummaryEntry {
  userId: string;
  name: string;
  totalIncome: string;
  totalExpense: string;
  balance: string;
  expenseSharePercentage: string;
}

export interface GetHouseholdCategorySummaryData {
  householdId: string;
  requesterId: string;
  startDate?: string;
  endDate?: string;
}

export interface HouseholdCategorySummaryEntry {
  categoryId: string | null;
  categoryName: string;
  totalExpense: string;
}

export interface GetHouseholdMonthlySummaryData {
  householdId: string;
  requesterId: string;
  months: string[];
}

export interface HouseholdMonthlySummaryEntry {
  month: string;
  totalIncome: string;
  totalExpense: string;
  balance: string;
}

export interface UpdateTransactionData {
  householdId: string;
  requesterId: string;
  transactionId: string;
  type?: TransactionType;
  amount?: string;
  transactionDate?: string;
  dueDate?: string | null;
  categoryId?: string | null;
  description?: string | null;
  status?: TransactionStatus;
  expenseNature?: TransactionExpenseNature | null;
}

export interface DeleteTransactionData {
  householdId: string;
  requesterId: string;
  transactionId: string;
}

export interface FindPendingTransactionAsOwnerData {
  householdId: string;
  requesterId: string;
  transactionId: string;
}

export interface TransactionRepository {
  createAsMember(data: CreateTransactionData): Promise<TransactionRecord>;
  listAsMember(data: ListTransactionsData): Promise<ListTransactionsResult>;
  getSummaryAsMember(data: GetHouseholdSummaryData): Promise<HouseholdSummary>;
  getUserSummaryAsMember(data: GetHouseholdUserSummaryData): Promise<HouseholdUserSummaryEntry[]>;
  getCategorySummaryAsMember(
    data: GetHouseholdCategorySummaryData,
  ): Promise<HouseholdCategorySummaryEntry[]>;
  getMonthlySummaryAsMember(
    data: GetHouseholdMonthlySummaryData,
  ): Promise<HouseholdMonthlySummaryEntry[]>;
  updateAsMember(data: UpdateTransactionData): Promise<TransactionRecord>;
  deleteAsMember(data: DeleteTransactionData): Promise<void>;
  findPendingAsOwner(data: FindPendingTransactionAsOwnerData): Promise<TransactionRecord>;
}

interface TransactionRow {
  id: string;
  type: TransactionType;
  amount: string;
  transactionDate: string;
  dueDate: string | null;
  categoryId: string | null;
  description: string | null;
  status: TransactionStatus;
  paidAt: Date | null;
  source: TransactionSource;
  expenseNature: TransactionExpenseNature | null;
  recurringTransactionId: string | null;
  recurringPeriod: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface HouseholdSummaryRow {
  totalIncome: string | null;
  totalExpense: string | null;
  balance: string | null;
}

interface HouseholdUserSummaryRow {
  userId: string;
  name: string;
  totalIncome: string | null;
  totalExpense: string | null;
  balance: string | null;
}

interface HouseholdTotalExpenseRow {
  totalExpense: string | null;
}

interface HouseholdCategorySummaryRow {
  categoryId: string | null;
  categoryName: string | null;
  totalExpense: string | null;
}

interface HouseholdMonthlySummaryRow {
  month: string;
  totalIncome: string | null;
  totalExpense: string | null;
  balance: string | null;
}

function normalizeMonetaryAggregate(value: string | null | undefined): string {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value ?? '0');

  if (!match) {
    throw new Error('Invalid monetary aggregate');
  }

  const sign = match[1] ?? '';
  const integer = (match[2] ?? '0').replace(/^0+(?=\d)/, '');
  const fraction = (match[3] ?? '').padEnd(2, '0');
  const normalizedSign = /^0+$/.test(integer) && /^0+$/.test(fraction) ? '' : sign;

  return `${normalizedSign}${integer}.${fraction}`;
}

function toBigIntCents(normalizedAmount: string): bigint {
  const [integer, fraction = '00'] = normalizedAmount.split('.');
  return BigInt(`${integer}${fraction}`);
}

function computeExpenseSharePercentage(
  userTotalExpense: string,
  householdTotalExpense: string,
): string {
  const householdCents = toBigIntCents(householdTotalExpense);

  if (householdCents === 0n) {
    return '0.00';
  }

  const userCents = toBigIntCents(userTotalExpense);
  const scaledNumerator = userCents * 10000n;
  const quotient = scaledNumerator / householdCents;
  const remainder = scaledNumerator % householdCents;
  const roundedHundredths = remainder * 2n >= householdCents ? quotient + 1n : quotient;
  const integerPart = roundedHundredths / 100n;
  const fractionPart = (roundedHundredths % 100n).toString().padStart(2, '0');

  return `${integerPart}.${fractionPart}`;
}

function toTransactionRecord(transaction: TransactionRow): TransactionRecord {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    transactionDate: transaction.transactionDate,
    dueDate: transaction.dueDate,
    categoryId: transaction.categoryId,
    description: transaction.description,
    status: transaction.status,
    paidAt: transaction.paidAt,
    source: transaction.source,
    expenseNature: transaction.expenseNature,
    recurringTransactionId: transaction.recurringTransactionId,
    recurringPeriod: transaction.recurringPeriod,
    createdBy: transaction.createdBy,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  };
}

export class TypeOrmTransactionRepository implements TransactionRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createAsMember(data: CreateTransactionData): Promise<TransactionRecord> {
    return this.dataSource.transaction(async (manager) => {
      const membership = await manager.findOne(HouseholdMemberEntity, {
        select: { id: true },
        where: {
          household: { id: data.householdId },
          user: { id: data.requesterId },
        },
        lock: { mode: 'pessimistic_read' },
      });

      if (!membership) {
        throw new ForbiddenError();
      }

      let category: CategoryEntity | null = null;

      if (data.categoryId !== null) {
        category = await manager.findOne(CategoryEntity, {
          select: { id: true, type: true },
          where: { id: data.categoryId, household: { id: data.householdId } },
          lock: { mode: 'pessimistic_read' },
        });

        if (!category || category.type !== data.type) {
          throw new InvalidCategoryError();
        }
      }

      const transaction = manager.create(TransactionEntity, {
        household: { id: data.householdId },
        category,
        createdBy: { id: data.requesterId },
        type: data.type,
        amount: data.amount,
        transactionDate: data.transactionDate,
        dueDate: data.dueDate,
        paidAt: data.paidAt,
        status: data.status,
        source: 'manual',
        externalId: null,
        description: data.description,
        expenseNature: data.expenseNature,
        recurringTransaction: null,
        recurringPeriod: null,
      });
      const savedTransaction = await manager.save(transaction);

      return {
        id: savedTransaction.id,
        type: savedTransaction.type,
        amount: savedTransaction.amount,
        transactionDate: savedTransaction.transactionDate,
        dueDate: savedTransaction.dueDate,
        categoryId: category?.id ?? null,
        description: savedTransaction.description,
        status: savedTransaction.status,
        paidAt: savedTransaction.paidAt,
        source: 'manual',
        expenseNature: savedTransaction.expenseNature,
        recurringTransactionId: null,
        recurringPeriod: null,
        createdBy: data.requesterId,
        createdAt: savedTransaction.createdAt,
        updatedAt: savedTransaction.updatedAt,
      };
    });
  }

  async updateAsMember(data: UpdateTransactionData): Promise<TransactionRecord> {
    return this.dataSource.transaction(async (manager) => {
      const membership = await manager.findOne(HouseholdMemberEntity, {
        select: { id: true, role: true },
        where: {
          household: { id: data.householdId },
          user: { id: data.requesterId },
        },
        lock: { mode: 'pessimistic_read' },
      });

      if (!membership) {
        throw new ForbiddenError();
      }

      const transaction = await manager.findOne(TransactionEntity, {
        select: {
          id: true,
          type: true,
          amount: true,
          transactionDate: true,
          dueDate: true,
          description: true,
          status: true,
          paidAt: true,
          source: true,
          externalId: true,
          expenseNature: true,
          recurringPeriod: true,
          createdAt: true,
          category: { id: true, type: true },
          createdBy: { id: true },
          recurringTransaction: { id: true },
        },
        relations: { category: true, createdBy: true, recurringTransaction: true },
        where: { id: data.transactionId, household: { id: data.householdId } },
        lock: { mode: 'pessimistic_write', tables: ['transactions'] },
      });

      if (!transaction) {
        throw new TransactionNotFoundError();
      }

      if (membership.role === 'member' && transaction.createdBy.id !== data.requesterId) {
        throw new ForbiddenError();
      }

      const finalType = data.type ?? transaction.type;
      const finalAmount = data.amount ?? transaction.amount;
      const finalTransactionDate = data.transactionDate ?? transaction.transactionDate;
      const finalDueDate = data.dueDate !== undefined ? data.dueDate : transaction.dueDate;
      const finalDescription =
        data.description !== undefined ? data.description : transaction.description;

      let finalCategory: CategoryEntity | null;

      if (data.categoryId !== undefined && data.categoryId !== null) {
        const category = await manager.findOne(CategoryEntity, {
          select: { id: true, type: true },
          where: { id: data.categoryId, household: { id: data.householdId } },
          lock: { mode: 'pessimistic_read' },
        });

        if (!category || category.type !== finalType) {
          throw new InvalidCategoryError();
        }

        finalCategory = category;
      } else if (data.categoryId === null) {
        finalCategory = null;
      } else if (transaction.category !== null && transaction.category.type !== finalType) {
        throw new InvalidCategoryError();
      } else {
        finalCategory = transaction.category;
      }

      let finalStatus: TransactionStatus;
      let finalPaidAt: Date | null;

      if (data.status === undefined) {
        finalStatus = transaction.status;
        finalPaidAt = transaction.paidAt;
      } else if (data.status === 'paid') {
        finalStatus = 'paid';
        finalPaidAt = transaction.status === 'paid' ? transaction.paidAt : new Date();
      } else {
        finalStatus = 'pending';
        finalPaidAt = null;
      }

      let finalExpenseNature: TransactionExpenseNature | null;

      if (finalType === 'income') {
        if (data.expenseNature !== undefined && data.expenseNature !== null) {
          throw new InvalidExpenseNatureError();
        }

        finalExpenseNature = null;
      } else if (data.expenseNature !== undefined) {
        finalExpenseNature = data.expenseNature;
      } else {
        finalExpenseNature = transaction.expenseNature;
      }

      transaction.type = finalType;
      transaction.amount = finalAmount;
      transaction.transactionDate = finalTransactionDate;
      transaction.dueDate = finalDueDate;
      transaction.description = finalDescription;
      transaction.status = finalStatus;
      transaction.paidAt = finalPaidAt;
      transaction.category = finalCategory;
      transaction.expenseNature = finalExpenseNature;

      const saved = await manager.save(transaction);

      return {
        id: saved.id,
        type: saved.type,
        amount: saved.amount,
        transactionDate: saved.transactionDate,
        dueDate: saved.dueDate,
        categoryId: finalCategory?.id ?? null,
        description: saved.description,
        status: saved.status,
        paidAt: saved.paidAt,
        source: saved.source,
        expenseNature: saved.expenseNature,
        recurringTransactionId: transaction.recurringTransaction?.id ?? null,
        recurringPeriod: saved.recurringPeriod,
        createdBy: transaction.createdBy.id,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };
    });
  }

  async deleteAsMember(data: DeleteTransactionData): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const membership = await manager.findOne(HouseholdMemberEntity, {
        select: { id: true, role: true },
        where: {
          household: { id: data.householdId },
          user: { id: data.requesterId },
        },
        lock: { mode: 'pessimistic_read' },
      });

      if (!membership) {
        throw new ForbiddenError();
      }

      const transaction = await manager.findOne(TransactionEntity, {
        select: { id: true, createdBy: { id: true } },
        relations: { createdBy: true },
        where: { id: data.transactionId, household: { id: data.householdId } },
        lock: { mode: 'pessimistic_write', tables: ['transactions'] },
      });

      if (!transaction) {
        throw new TransactionNotFoundError();
      }

      if (membership.role === 'member' && transaction.createdBy.id !== data.requesterId) {
        throw new ForbiddenError();
      }

      await manager.remove(transaction);
    });
  }

  async findPendingAsOwner(data: FindPendingTransactionAsOwnerData): Promise<TransactionRecord> {
    const membership = await this.dataSource.getRepository(HouseholdMemberEntity).findOne({
      select: { id: true, role: true },
      where: {
        household: { id: data.householdId },
        user: { id: data.requesterId },
      },
    });

    if (membership?.role !== 'owner') {
      throw new ForbiddenError();
    }

    const transaction = await this.dataSource.getRepository(TransactionEntity).findOne({
      select: {
        id: true,
        type: true,
        amount: true,
        transactionDate: true,
        dueDate: true,
        description: true,
        status: true,
        paidAt: true,
        source: true,
        expenseNature: true,
        recurringPeriod: true,
        createdAt: true,
        updatedAt: true,
        category: { id: true },
        createdBy: { id: true },
        recurringTransaction: { id: true },
      },
      relations: { category: true, createdBy: true, recurringTransaction: true },
      where: { id: data.transactionId, household: { id: data.householdId } },
    });

    if (!transaction) {
      throw new TransactionNotFoundError();
    }

    if (transaction.status !== 'pending') {
      throw new TransactionAlreadyPaidError();
    }

    return toTransactionRecord({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      transactionDate: transaction.transactionDate,
      dueDate: transaction.dueDate,
      categoryId: transaction.category?.id ?? null,
      description: transaction.description,
      status: transaction.status,
      paidAt: transaction.paidAt,
      source: transaction.source,
      expenseNature: transaction.expenseNature,
      recurringTransactionId: transaction.recurringTransaction?.id ?? null,
      recurringPeriod: transaction.recurringPeriod,
      createdBy: transaction.createdBy.id,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    });
  }

  async getSummaryAsMember(data: GetHouseholdSummaryData): Promise<HouseholdSummary> {
    const membership = await this.dataSource.getRepository(HouseholdMemberEntity).findOne({
      select: { id: true },
      where: {
        household: { id: data.householdId },
        user: { id: data.requesterId },
      },
    });

    if (!membership) {
      throw new ForbiddenError();
    }

    const query = this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder('transaction')
      .select(
        `COALESCE(
          SUM(CASE WHEN transaction.type = 'income' THEN transaction.amount ELSE 0 END),
          0
        )`,
        'totalIncome',
      )
      .addSelect(
        `COALESCE(
          SUM(CASE WHEN transaction.type = 'expense' THEN transaction.amount ELSE 0 END),
          0
        )`,
        'totalExpense',
      )
      .addSelect(
        `COALESCE(
          SUM(
            CASE
              WHEN transaction.type = 'income' THEN transaction.amount
              WHEN transaction.type = 'expense' THEN -transaction.amount
              ELSE 0
            END
          ),
          0
        )`,
        'balance',
      )
      .where('transaction.household_id = :householdId', { householdId: data.householdId })
      .andWhere(
        `EXISTS (
          SELECT 1
          FROM household_members requester_membership
          WHERE requester_membership.household_id = transaction.household_id
            AND requester_membership.user_id = :requesterId
        )`,
        { requesterId: data.requesterId },
      );

    if (data.startDate !== undefined) {
      query.andWhere('transaction.transaction_date >= :startDate', {
        startDate: data.startDate,
      });
    }

    if (data.endDate !== undefined) {
      query.andWhere('transaction.transaction_date <= :endDate', { endDate: data.endDate });
    }

    const summary = await query.getRawOne<HouseholdSummaryRow>();

    return {
      totalIncome: normalizeMonetaryAggregate(summary?.totalIncome),
      totalExpense: normalizeMonetaryAggregate(summary?.totalExpense),
      balance: normalizeMonetaryAggregate(summary?.balance),
    };
  }

  async getUserSummaryAsMember(
    data: GetHouseholdUserSummaryData,
  ): Promise<HouseholdUserSummaryEntry[]> {
    const membership = await this.dataSource.getRepository(HouseholdMemberEntity).findOne({
      select: { id: true },
      where: {
        household: { id: data.householdId },
        user: { id: data.requesterId },
      },
    });

    if (!membership) {
      throw new ForbiddenError();
    }

    const transactionJoinConditions = [
      'transaction.household_id = member.household_id',
      'transaction.created_by = member.user_id',
    ];
    const transactionJoinParameters: Record<string, string> = {};

    if (data.startDate !== undefined) {
      transactionJoinConditions.push('transaction.transaction_date >= :userSummaryStartDate');
      transactionJoinParameters.userSummaryStartDate = data.startDate;
    }

    if (data.endDate !== undefined) {
      transactionJoinConditions.push('transaction.transaction_date <= :userSummaryEndDate');
      transactionJoinParameters.userSummaryEndDate = data.endDate;
    }

    const memberRows = await this.dataSource
      .getRepository(HouseholdMemberEntity)
      .createQueryBuilder('member')
      .innerJoin('member.user', 'user')
      .leftJoin(
        TransactionEntity,
        'transaction',
        transactionJoinConditions.join(' AND '),
        transactionJoinParameters,
      )
      .select('member.user_id', 'userId')
      .addSelect('user.name', 'name')
      .addSelect(
        `COALESCE(
          SUM(CASE WHEN transaction.type = 'income' THEN transaction.amount ELSE 0 END),
          0
        )`,
        'totalIncome',
      )
      .addSelect(
        `COALESCE(
          SUM(CASE WHEN transaction.type = 'expense' THEN transaction.amount ELSE 0 END),
          0
        )`,
        'totalExpense',
      )
      .addSelect(
        `COALESCE(
          SUM(
            CASE
              WHEN transaction.type = 'income' THEN transaction.amount
              WHEN transaction.type = 'expense' THEN -transaction.amount
              ELSE 0
            END
          ),
          0
        )`,
        'balance',
      )
      .where('member.household_id = :householdId', { householdId: data.householdId })
      .groupBy('member.user_id')
      .addGroupBy('user.name')
      .orderBy('user.name', 'ASC')
      .addOrderBy('member.user_id', 'ASC')
      .getRawMany<HouseholdUserSummaryRow>();

    const totalExpenseQuery = this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder('transaction')
      .select(
        `COALESCE(
          SUM(CASE WHEN transaction.type = 'expense' THEN transaction.amount ELSE 0 END),
          0
        )`,
        'totalExpense',
      )
      .where('transaction.household_id = :householdId', { householdId: data.householdId });

    if (data.startDate !== undefined) {
      totalExpenseQuery.andWhere('transaction.transaction_date >= :startDate', {
        startDate: data.startDate,
      });
    }

    if (data.endDate !== undefined) {
      totalExpenseQuery.andWhere('transaction.transaction_date <= :endDate', {
        endDate: data.endDate,
      });
    }

    const totalExpenseRow = await totalExpenseQuery.getRawOne<HouseholdTotalExpenseRow>();
    const householdTotalExpense = normalizeMonetaryAggregate(totalExpenseRow?.totalExpense);

    return memberRows.map((row) => {
      const totalExpense = normalizeMonetaryAggregate(row.totalExpense);

      return {
        userId: row.userId,
        name: row.name,
        totalIncome: normalizeMonetaryAggregate(row.totalIncome),
        totalExpense,
        balance: normalizeMonetaryAggregate(row.balance),
        expenseSharePercentage: computeExpenseSharePercentage(totalExpense, householdTotalExpense),
      };
    });
  }

  async getCategorySummaryAsMember(
    data: GetHouseholdCategorySummaryData,
  ): Promise<HouseholdCategorySummaryEntry[]> {
    const membership = await this.dataSource.getRepository(HouseholdMemberEntity).findOne({
      select: { id: true },
      where: {
        household: { id: data.householdId },
        user: { id: data.requesterId },
      },
    });

    if (!membership) {
      throw new ForbiddenError();
    }

    const query = this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .select('transaction.category_id', 'categoryId')
      .addSelect("COALESCE(category.name, 'Sem categoria')", 'categoryName')
      .addSelect('COALESCE(SUM(transaction.amount), 0)', 'totalExpense')
      .where('transaction.household_id = :householdId', { householdId: data.householdId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .andWhere(
        `EXISTS (
          SELECT 1
          FROM household_members requester_membership
          WHERE requester_membership.household_id = transaction.household_id
            AND requester_membership.user_id = :requesterId
        )`,
        { requesterId: data.requesterId },
      );

    if (data.startDate !== undefined) {
      query.andWhere('transaction.transaction_date >= :startDate', {
        startDate: data.startDate,
      });
    }

    if (data.endDate !== undefined) {
      query.andWhere('transaction.transaction_date <= :endDate', { endDate: data.endDate });
    }

    const rows = await query
      .groupBy('transaction.category_id')
      .addGroupBy('category.name')
      .orderBy('COALESCE(SUM(transaction.amount), 0)', 'DESC')
      .addOrderBy('transaction.category_id', 'ASC')
      .getRawMany<HouseholdCategorySummaryRow>();

    return rows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? 'Sem categoria',
      totalExpense: normalizeMonetaryAggregate(row.totalExpense),
    }));
  }

  async getMonthlySummaryAsMember(
    data: GetHouseholdMonthlySummaryData,
  ): Promise<HouseholdMonthlySummaryEntry[]> {
    const membership = await this.dataSource.getRepository(HouseholdMemberEntity).findOne({
      select: { id: true },
      where: {
        household: { id: data.householdId },
        user: { id: data.requesterId },
      },
    });

    if (!membership) {
      throw new ForbiddenError();
    }

    const rows = await this.dataSource.query<HouseholdMonthlySummaryRow[]>(
      `
        SELECT
          month_series.month AS month,
          COALESCE(
            SUM(CASE WHEN transaction.type = 'income' THEN transaction.amount ELSE 0 END),
            0
          ) AS "totalIncome",
          COALESCE(
            SUM(CASE WHEN transaction.type = 'expense' THEN transaction.amount ELSE 0 END),
            0
          ) AS "totalExpense",
          COALESCE(
            SUM(
              CASE
                WHEN transaction.type = 'income' THEN transaction.amount
                WHEN transaction.type = 'expense' THEN -transaction.amount
                ELSE 0
              END
            ),
            0
          ) AS "balance"
        FROM unnest($2::text[]) AS month_series(month)
        LEFT JOIN transactions transaction
          ON transaction.household_id = $1
          AND to_char(transaction.transaction_date, 'YYYY-MM') = month_series.month
          AND EXISTS (
            SELECT 1
            FROM household_members requester_membership
            WHERE requester_membership.household_id = transaction.household_id
              AND requester_membership.user_id = $3
          )
        GROUP BY month_series.month
        ORDER BY month_series.month ASC
      `,
      [data.householdId, data.months, data.requesterId],
    );

    return rows.map((row) => ({
      month: row.month,
      totalIncome: normalizeMonetaryAggregate(row.totalIncome),
      totalExpense: normalizeMonetaryAggregate(row.totalExpense),
      balance: normalizeMonetaryAggregate(row.balance),
    }));
  }

  async listAsMember(data: ListTransactionsData): Promise<ListTransactionsResult> {
    const membership = await this.dataSource.getRepository(HouseholdMemberEntity).findOne({
      select: { id: true },
      where: {
        household: { id: data.householdId },
        user: { id: data.requesterId },
      },
    });

    if (!membership) {
      throw new ForbiddenError();
    }

    const query = this.dataSource
      .getRepository(TransactionEntity)
      .createQueryBuilder('transaction')
      .where('transaction.household_id = :householdId', { householdId: data.householdId })
      .andWhere(
        `EXISTS (
          SELECT 1
          FROM household_members requester_membership
          WHERE requester_membership.household_id = transaction.household_id
            AND requester_membership.user_id = :requesterId
        )`,
        { requesterId: data.requesterId },
      );

    if (data.type !== undefined) {
      query.andWhere('transaction.type = :type', { type: data.type });
    }

    if (data.status !== undefined) {
      query.andWhere('transaction.status = :status', { status: data.status });
    }

    if (data.state !== undefined) {
      query.andWhere('transaction.status = :stateStatus', { stateStatus: 'pending' });

      if (data.state === 'pending') {
        query.andWhere(
          `(
            transaction.due_date IS NULL
            OR transaction.due_date >= :today
          )`,
          { today: data.today },
        );
      } else {
        query.andWhere('transaction.due_date IS NOT NULL');
        query.andWhere('transaction.due_date < :today', { today: data.today });
      }
    }

    if (data.categoryId !== undefined) {
      query.andWhere('transaction.category_id = :categoryId', { categoryId: data.categoryId });
    }

    if (data.createdBy !== undefined) {
      query.andWhere('transaction.created_by = :createdBy', { createdBy: data.createdBy });
    }

    if (data.expenseNature !== undefined) {
      query.andWhere('transaction.expense_nature = :expenseNature', {
        expenseNature: data.expenseNature,
      });
    }

    if (data.recurringTransactionId !== undefined) {
      query.andWhere('transaction.recurring_transaction_id = :recurringTransactionId', {
        recurringTransactionId: data.recurringTransactionId,
      });
    }

    if (data.startDate !== undefined) {
      query.andWhere('transaction.transaction_date >= :startDate', {
        startDate: data.startDate,
      });
    }

    if (data.endDate !== undefined) {
      query.andWhere('transaction.transaction_date <= :endDate', { endDate: data.endDate });
    }

    const total = await query.getCount();

    query
      .select('transaction.id', 'id')
      .addSelect('transaction.type', 'type')
      .addSelect('transaction.amount', 'amount')
      .addSelect('transaction.transaction_date', 'transactionDate')
      .addSelect('transaction.due_date', 'dueDate')
      .addSelect('transaction.category_id', 'categoryId')
      .addSelect('transaction.description', 'description')
      .addSelect('transaction.status', 'status')
      .addSelect('transaction.paid_at', 'paidAt')
      .addSelect('transaction.source', 'source')
      .addSelect('transaction.expense_nature', 'expenseNature')
      .addSelect('transaction.recurring_transaction_id', 'recurringTransactionId')
      .addSelect('transaction.recurring_period', 'recurringPeriod')
      .addSelect('transaction.created_by', 'createdBy')
      .addSelect('transaction.created_at', 'createdAt')
      .addSelect('transaction.updated_at', 'updatedAt');

    if (data.sortBy === 'dueDate') {
      // Whitelisted sort: the controller only ever passes 'dueDate' (asc/desc) here, so this
      // never interpolates a user-provided column or direction into SQL.
      const direction = data.sortOrder === 'desc' ? 'DESC' : 'ASC';

      query
        .orderBy('transaction.due_date', direction, 'NULLS LAST')
        .addOrderBy('transaction.created_at', direction)
        .addOrderBy('transaction.id', direction);
    } else {
      query
        .orderBy('transaction.transaction_date', 'DESC')
        .addOrderBy('transaction.created_at', 'DESC')
        .addOrderBy('transaction.id', 'DESC');
    }

    const transactions = await query
      .offset((data.page - 1) * data.limit)
      .limit(data.limit)
      .getRawMany<TransactionRow>();

    return { records: transactions.map(toTransactionRecord), total };
  }
}
