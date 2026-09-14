import { z } from 'zod';

import type { TransactionRecord } from '../repositories/transaction-repository.js';

export function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return (
    year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= (daysPerMonth[month - 1] ?? 0)
  );
}

export const transactionDateSchema = z.string().refine(isValidCalendarDate);

export const amountSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/)
  .refine((amount) => !/^0(?:\.0{1,2})?$/.test(amount))
  .transform((amount) => {
    const [integer, fraction = ''] = amount.split('.');
    return `${integer}.${fraction.padEnd(2, '0')}`;
  });

export const descriptionSchema = z.string().trim().max(255).nullable().optional();

export const transactionExpenseNatureSchema = z.enum(['fixed', 'variable']);

export function isExpenseNatureConsistentWithType(payload: {
  type?: 'income' | 'expense' | undefined;
  expenseNature?: 'fixed' | 'variable' | null | undefined;
}): boolean {
  return (
    payload.type !== 'income' ||
    payload.expenseNature === undefined ||
    payload.expenseNature === null
  );
}

export function serializeTransaction(transaction: TransactionRecord): {
  id: string;
  type: TransactionRecord['type'];
  amount: string;
  transactionDate: string;
  dueDate: string | null;
  categoryId: string | null;
  description: string | null;
  status: TransactionRecord['status'];
  paidAt: string | null;
  source: TransactionRecord['source'];
  expenseNature: TransactionRecord['expenseNature'];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    transactionDate: transaction.transactionDate,
    dueDate: transaction.dueDate,
    categoryId: transaction.categoryId,
    description: transaction.description,
    status: transaction.status,
    paidAt: transaction.paidAt?.toISOString() ?? null,
    source: transaction.source,
    expenseNature: transaction.expenseNature,
    createdBy: transaction.createdBy,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}
