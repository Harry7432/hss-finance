import type { DataSource } from 'typeorm';

import { CategoryEntity } from '../database/entities/category.entity.js';
import { HouseholdMemberEntity } from '../database/entities/household-member.entity.js';
import { CategoryAlreadyExistsError } from '../errors/category-already-exists-error.js';
import { CategoryInUseError } from '../errors/category-in-use-error.js';
import { CategoryNotFoundError } from '../errors/category-not-found-error.js';
import { ForbiddenError } from '../errors/forbidden-error.js';

const UNIQUE_VIOLATION_CODE = '23505';
const FOREIGN_KEY_VIOLATION_CODE = '23503';
const CATEGORY_UNIQUE_CONSTRAINT = 'uq_categories_household_type_name';
const TRANSACTION_CATEGORY_FOREIGN_KEY = 'fk_transactions_category';
const RECURRING_TRANSACTION_CATEGORY_FOREIGN_KEY = 'fk_recurring_transactions_category';

export type CategoryType = 'income' | 'expense';

export interface CategoryRecord {
  id: string;
  name: string;
  type: CategoryType;
  color: string | null;
  icon: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCategoryData {
  householdId: string;
  name: string;
  type: CategoryType;
  color: string | null;
  icon: string | null;
}

export interface UpdateCategoryData {
  name?: string;
  color?: string | null;
  icon?: string | null;
}

export interface CategoryRepository {
  create(data: CreateCategoryData): Promise<CategoryRecord>;
  list(householdId: string, type?: CategoryType): Promise<CategoryRecord[]>;
  update(
    householdId: string,
    categoryId: string,
    data: UpdateCategoryData,
  ): Promise<CategoryRecord | null>;
  deleteAsOwner(householdId: string, requesterId: string, categoryId: string): Promise<void>;
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

function toCategoryRecord(category: CategoryEntity): CategoryRecord {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    color: category.color,
    icon: category.icon,
    isDefault: category.isDefault,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

export class TypeOrmCategoryRepository implements CategoryRepository {
  constructor(private readonly dataSource: DataSource) {}

  async create(data: CreateCategoryData): Promise<CategoryRecord> {
    const repository = this.dataSource.getRepository(CategoryEntity);
    const category = repository.create({
      household: { id: data.householdId },
      name: data.name,
      type: data.type,
      color: data.color,
      icon: data.icon,
      isDefault: false,
    });

    try {
      return toCategoryRecord(await repository.save(category));
    } catch (error: unknown) {
      if (hasDriverConstraint(error, UNIQUE_VIOLATION_CODE, CATEGORY_UNIQUE_CONSTRAINT)) {
        throw new CategoryAlreadyExistsError();
      }

      throw error;
    }
  }

  async list(householdId: string, type?: CategoryType): Promise<CategoryRecord[]> {
    const categories = await this.dataSource.getRepository(CategoryEntity).find({
      where: {
        household: { id: householdId },
        ...(type === undefined ? {} : { type }),
      },
      order: { type: 'ASC', name: 'ASC', id: 'ASC' },
    });

    return categories.map(toCategoryRecord);
  }

  async update(
    householdId: string,
    categoryId: string,
    data: UpdateCategoryData,
  ): Promise<CategoryRecord | null> {
    const repository = this.dataSource.getRepository(CategoryEntity);
    const category = await repository.findOne({
      where: { id: categoryId, household: { id: householdId } },
    });

    if (!category) {
      return null;
    }

    if (data.name !== undefined) {
      category.name = data.name;
    }

    if (data.color !== undefined) {
      category.color = data.color;
    }

    if (data.icon !== undefined) {
      category.icon = data.icon;
    }

    try {
      return toCategoryRecord(await repository.save(category));
    } catch (error: unknown) {
      if (hasDriverConstraint(error, UNIQUE_VIOLATION_CODE, CATEGORY_UNIQUE_CONSTRAINT)) {
        throw new CategoryAlreadyExistsError();
      }

      throw error;
    }
  }

  async deleteAsOwner(householdId: string, requesterId: string, categoryId: string): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const membership = await manager.findOne(HouseholdMemberEntity, {
          select: { id: true, role: true },
          where: {
            household: { id: householdId },
            user: { id: requesterId },
          },
          lock: { mode: 'pessimistic_read' },
        });

        if (membership?.role !== 'owner') {
          throw new ForbiddenError();
        }

        const category = await manager.findOne(CategoryEntity, {
          where: { id: categoryId, household: { id: householdId } },
          lock: { mode: 'pessimistic_write' },
        });

        if (!category) {
          throw new CategoryNotFoundError();
        }

        await manager.remove(category);
      });
    } catch (error: unknown) {
      if (
        hasDriverConstraint(error, FOREIGN_KEY_VIOLATION_CODE, TRANSACTION_CATEGORY_FOREIGN_KEY) ||
        hasDriverConstraint(
          error,
          FOREIGN_KEY_VIOLATION_CODE,
          RECURRING_TRANSACTION_CATEGORY_FOREIGN_KEY,
        )
      ) {
        throw new CategoryInUseError();
      }

      throw error;
    }
  }
}
