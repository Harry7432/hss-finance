import type { DataSource } from 'typeorm';

import { CategoryEntity } from '../database/entities/category.entity.js';
import { HouseholdMemberEntity } from '../database/entities/household-member.entity.js';
import { RecurringTransactionEntity } from '../database/entities/recurring-transaction.entity.js';
import { TransactionEntity } from '../database/entities/transaction.entity.js';
import { ForbiddenError } from '../errors/forbidden-error.js';
import { InvalidCategoryError } from '../errors/invalid-category-error.js';
import { InvalidExpenseNatureError } from '../errors/invalid-expense-nature-error.js';
import { RecurringTransactionNotFoundError } from '../errors/recurring-transaction-not-found-error.js';

const UNIQUE_VIOLATION_CODE = '23505';
const RECURRING_TRANSACTION_PERIOD_UNIQUE_CONSTRAINT =
  'uq_transactions_recurring_transaction_period';

export type RecurringTransactionType = 'income' | 'expense';
export type RecurringTransactionFrequency = 'monthly';
export type RecurringTransactionExpenseNature = 'fixed' | 'variable';

export interface RecurringTransactionRecord {
  id: string;
  type: RecurringTransactionType;
  amount: string;
  categoryId: string | null;
  expenseNature: RecurringTransactionExpenseNature | null;
  description: string | null;
  dayOfMonth: number;
  frequency: RecurringTransactionFrequency;
  isActive: boolean;
  startDate: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRecurringTransactionData {
  householdId: string;
  requesterId: string;
  type: RecurringTransactionType;
  amount: string;
  categoryId: string | null;
  expenseNature: RecurringTransactionExpenseNature | null;
  description: string | null;
  dayOfMonth: number;
  startDate: string;
}

export interface ListRecurringTransactionsData {
  householdId: string;
  requesterId: string;
  isActive?: boolean;
}

export interface UpdateRecurringTransactionData {
  householdId: string;
  requesterId: string;
  recurringTransactionId: string;
  type?: RecurringTransactionType;
  amount?: string;
  categoryId?: string | null;
  expenseNature?: RecurringTransactionExpenseNature | null;
  description?: string | null;
  dayOfMonth?: number;
  isActive?: boolean;
  startDate?: string;
}

export interface GenerateRecurringTransactionsData {
  householdId: string;
  requesterId: string;
  referenceDate: string;
}

export interface GenerateRecurringTransactionsResult {
  created: number;
  skipped: number;
}

export interface RecurringTransactionRepository {
  createAsMember(data: CreateRecurringTransactionData): Promise<RecurringTransactionRecord>;
  listAsMember(data: ListRecurringTransactionsData): Promise<RecurringTransactionRecord[]>;
  updateAsMember(data: UpdateRecurringTransactionData): Promise<RecurringTransactionRecord>;
  generateAsMember(
    data: GenerateRecurringTransactionsData,
  ): Promise<GenerateRecurringTransactionsResult>;
}

interface YearMonth {
  year: number;
  month: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasDriverConstraint(error: unknown, code: string, constraint: string): boolean {
  if (!isRecord(error) || !isRecord(error.driverError)) {
    return false;
  }

  return error.driverError.code === code && error.driverError.constraint === constraint;
}

function parseYearMonth(date: string): YearMonth {
  const [yearPart, monthPart] = date.split('-');
  return { year: Number(yearPart), month: Number(monthPart) };
}

function toMonthIndex({ year, month }: YearMonth): number {
  return year * 12 + (month - 1);
}

function fromMonthIndex(monthIndex: number): YearMonth {
  return { year: Math.floor(monthIndex / 12), month: (monthIndex % 12) + 1 };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const daysPerMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysPerMonth[month - 1] ?? 31;
}

function clampDayOfMonth(year: number, month: number, dayOfMonth: number): number {
  return Math.min(dayOfMonth, daysInMonth(year, month));
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toRecurringTransactionRecord(
  entity: RecurringTransactionEntity,
): RecurringTransactionRecord {
  return {
    id: entity.id,
    type: entity.type,
    amount: entity.amount,
    categoryId: entity.category?.id ?? null,
    expenseNature: entity.expenseNature,
    description: entity.description,
    dayOfMonth: entity.dayOfMonth,
    frequency: entity.frequency,
    isActive: entity.isActive,
    startDate: entity.startDate,
    createdBy: entity.createdBy.id,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export class TypeOrmRecurringTransactionRepository implements RecurringTransactionRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createAsMember(data: CreateRecurringTransactionData): Promise<RecurringTransactionRecord> {
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

      const recurringTransaction = manager.create(RecurringTransactionEntity, {
        household: { id: data.householdId },
        category,
        createdBy: { id: data.requesterId },
        type: data.type,
        amount: data.amount,
        expenseNature: data.expenseNature,
        description: data.description,
        dayOfMonth: data.dayOfMonth,
        frequency: 'monthly',
        isActive: true,
        startDate: data.startDate,
      });
      const saved = await manager.save(recurringTransaction);

      return {
        id: saved.id,
        type: saved.type,
        amount: saved.amount,
        categoryId: category?.id ?? null,
        expenseNature: saved.expenseNature,
        description: saved.description,
        dayOfMonth: saved.dayOfMonth,
        frequency: saved.frequency,
        isActive: saved.isActive,
        startDate: saved.startDate,
        createdBy: data.requesterId,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };
    });
  }

  async listAsMember(data: ListRecurringTransactionsData): Promise<RecurringTransactionRecord[]> {
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

    const templates = await this.dataSource.getRepository(RecurringTransactionEntity).find({
      where: {
        household: { id: data.householdId },
        ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
      },
      relations: { category: true, createdBy: true },
      order: { description: 'ASC', id: 'ASC' },
    });

    return templates.map(toRecurringTransactionRecord);
  }

  async updateAsMember(data: UpdateRecurringTransactionData): Promise<RecurringTransactionRecord> {
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

      const template = await manager.findOne(RecurringTransactionEntity, {
        select: {
          id: true,
          type: true,
          amount: true,
          expenseNature: true,
          description: true,
          dayOfMonth: true,
          frequency: true,
          isActive: true,
          startDate: true,
          createdAt: true,
          category: { id: true, type: true },
          createdBy: { id: true },
        },
        relations: { category: true, createdBy: true },
        where: { id: data.recurringTransactionId, household: { id: data.householdId } },
        lock: { mode: 'pessimistic_write', tables: ['recurring_transactions'] },
      });

      if (!template) {
        throw new RecurringTransactionNotFoundError();
      }

      if (membership.role === 'member' && template.createdBy.id !== data.requesterId) {
        throw new ForbiddenError();
      }

      const finalType = data.type ?? template.type;
      const finalAmount = data.amount ?? template.amount;
      const finalDayOfMonth = data.dayOfMonth ?? template.dayOfMonth;
      const finalIsActive = data.isActive ?? template.isActive;
      const finalStartDate = data.startDate ?? template.startDate;
      const finalDescription =
        data.description !== undefined ? data.description : template.description;

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
      } else if (template.category !== null && template.category.type !== finalType) {
        throw new InvalidCategoryError();
      } else {
        finalCategory = template.category;
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
        finalExpenseNature = template.expenseNature;
      }

      template.type = finalType;
      template.amount = finalAmount;
      template.category = finalCategory;
      template.expenseNature = finalExpenseNature;
      template.description = finalDescription;
      template.dayOfMonth = finalDayOfMonth;
      template.isActive = finalIsActive;
      template.startDate = finalStartDate;

      const saved = await manager.save(template);

      return {
        id: saved.id,
        type: saved.type,
        amount: saved.amount,
        categoryId: finalCategory?.id ?? null,
        expenseNature: saved.expenseNature,
        description: saved.description,
        dayOfMonth: saved.dayOfMonth,
        frequency: saved.frequency,
        isActive: saved.isActive,
        startDate: saved.startDate,
        createdBy: template.createdBy.id,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };
    });
  }

  async generateAsMember(
    data: GenerateRecurringTransactionsData,
  ): Promise<GenerateRecurringTransactionsResult> {
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

    const templates = await this.dataSource.getRepository(RecurringTransactionEntity).find({
      where: { household: { id: data.householdId }, isActive: true },
      relations: { category: true, createdBy: true },
    });

    const referenceMonthIndex = toMonthIndex(parseYearMonth(data.referenceDate));
    const transactionRepository = this.dataSource.getRepository(TransactionEntity);
    let created = 0;
    let skipped = 0;

    for (const template of templates) {
      const startMonthIndex = toMonthIndex(parseYearMonth(template.startDate));

      for (let monthIndex = startMonthIndex; monthIndex <= referenceMonthIndex; monthIndex += 1) {
        const { year, month } = fromMonthIndex(monthIndex);
        const occurrenceDate = formatDate(
          year,
          month,
          clampDayOfMonth(year, month, template.dayOfMonth),
        );

        if (occurrenceDate < template.startDate) {
          continue;
        }

        const period = formatDate(year, month, 1);

        const transaction = transactionRepository.create({
          household: { id: data.householdId },
          category: template.category,
          createdBy: { id: template.createdBy.id },
          type: template.type,
          amount: template.amount,
          transactionDate: occurrenceDate,
          dueDate: occurrenceDate,
          paidAt: null,
          status: 'pending',
          source: 'recurring',
          externalId: null,
          description: template.description,
          expenseNature: template.expenseNature,
          recurringTransaction: template,
          recurringPeriod: period,
        });

        try {
          await transactionRepository.save(transaction);
          created += 1;
        } catch (error: unknown) {
          if (
            hasDriverConstraint(
              error,
              UNIQUE_VIOLATION_CODE,
              RECURRING_TRANSACTION_PERIOD_UNIQUE_CONSTRAINT,
            )
          ) {
            skipped += 1;
            continue;
          }

          throw error;
        }
      }
    }

    return { created, skipped };
  }
}
