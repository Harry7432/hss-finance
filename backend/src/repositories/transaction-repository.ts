import type { DataSource } from 'typeorm';

import { CategoryEntity } from '../database/entities/category.entity.js';
import { HouseholdMemberEntity } from '../database/entities/household-member.entity.js';
import { TransactionEntity } from '../database/entities/transaction.entity.js';
import { ForbiddenError } from '../errors/forbidden-error.js';
import { InvalidCategoryError } from '../errors/invalid-category-error.js';

export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'pending' | 'paid';

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
  source: 'manual';
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

export interface TransactionRepository {
  createAsMember(data: CreateTransactionData): Promise<TransactionRecord>;
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
}
