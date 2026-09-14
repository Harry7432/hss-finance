import type { DataSource } from 'typeorm';

import { CategoryEntity } from '../database/entities/category.entity.js';
import { HouseholdMemberEntity } from '../database/entities/household-member.entity.js';
import { TransactionEntity } from '../database/entities/transaction.entity.js';
import { ForbiddenError } from '../errors/forbidden-error.js';
import { InvalidCategoryError } from '../errors/invalid-category-error.js';
import { TransactionNotFoundError } from '../errors/transaction-not-found-error.js';

export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'pending' | 'paid';
export type TransactionState = 'pending' | 'overdue';
export type TransactionSource = 'manual' | 'bank_import';

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
}

export interface ListTransactionsData {
  householdId: string;
  requesterId: string;
  type?: TransactionType;
  status?: TransactionStatus;
  state?: TransactionState;
  categoryId?: string;
  createdBy?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
  today: string;
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
}

export interface DeleteTransactionData {
  householdId: string;
  requesterId: string;
  transactionId: string;
}

export interface TransactionRepository {
  createAsMember(data: CreateTransactionData): Promise<TransactionRecord>;
  listAsMember(data: ListTransactionsData): Promise<ListTransactionsResult>;
  getSummaryAsMember(data: GetHouseholdSummaryData): Promise<HouseholdSummary>;
  updateAsMember(data: UpdateTransactionData): Promise<TransactionRecord>;
  deleteAsMember(data: DeleteTransactionData): Promise<void>;
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
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface HouseholdSummaryRow {
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
          createdAt: true,
          category: { id: true, type: true },
          createdBy: { id: true },
        },
        relations: { category: true, createdBy: true },
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

      transaction.type = finalType;
      transaction.amount = finalAmount;
      transaction.transactionDate = finalTransactionDate;
      transaction.dueDate = finalDueDate;
      transaction.description = finalDescription;
      transaction.status = finalStatus;
      transaction.paidAt = finalPaidAt;
      transaction.category = finalCategory;

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

    if (data.startDate !== undefined) {
      query.andWhere('transaction.transaction_date >= :startDate', {
        startDate: data.startDate,
      });
    }

    if (data.endDate !== undefined) {
      query.andWhere('transaction.transaction_date <= :endDate', { endDate: data.endDate });
    }

    const total = await query.getCount();
    const transactions = await query
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
      .addSelect('transaction.created_by', 'createdBy')
      .addSelect('transaction.created_at', 'createdAt')
      .addSelect('transaction.updated_at', 'updatedAt')
      .orderBy('transaction.transaction_date', 'DESC')
      .addOrderBy('transaction.created_at', 'DESC')
      .addOrderBy('transaction.id', 'DESC')
      .offset((data.page - 1) * data.limit)
      .limit(data.limit)
      .getRawMany<TransactionRow>();

    return { records: transactions.map(toTransactionRecord), total };
  }
}
