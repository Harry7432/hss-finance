import { z } from 'zod';

import type { RecurringTransactionRecord } from '../repositories/recurring-transaction-repository.js';

export const dayOfMonthSchema = z.number().int().min(1).max(31);

export function serializeRecurringTransaction(record: RecurringTransactionRecord): {
  id: string;
  type: RecurringTransactionRecord['type'];
  amount: string;
  categoryId: string | null;
  expenseNature: RecurringTransactionRecord['expenseNature'];
  description: string | null;
  dayOfMonth: number;
  frequency: RecurringTransactionRecord['frequency'];
  isActive: boolean;
  startDate: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: record.id,
    type: record.type,
    amount: record.amount,
    categoryId: record.categoryId,
    expenseNature: record.expenseNature,
    description: record.description,
    dayOfMonth: record.dayOfMonth,
    frequency: record.frequency,
    isActive: record.isActive,
    startDate: record.startDate,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
