import type { DataSource } from 'typeorm';

import { CategoryEntity } from '../database/entities/category.entity.js';
import { HouseholdMemberEntity } from '../database/entities/household-member.entity.js';
import { TransactionEntity } from '../database/entities/transaction.entity.js';
import { ForbiddenError } from '../errors/forbidden-error.js';
import { InvalidCategoryError } from '../errors/invalid-category-error.js';

export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'pending' | 'paid';
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
  categoryId?: string;
  createdBy?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
}

export interface ListTransactionsResult {
  records: TransactionRecord[];
  total: number;
}

export interface TransactionRepository {
  createAsMember(data: CreateTransactionData): Promise<TransactionRecord>;
  listAsMember(data: ListTransactionsData): Promise<ListTransactionsResult>;
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
