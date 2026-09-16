import type { Category } from './category-api';
import type { TransactionListFilters, TransactionRecord } from './transaction-api';

export type TransactionRowState = 'paid' | 'pending' | 'overdue';

export const NO_CATEGORY_LABEL = 'Sem categoria';

export interface TransactionFiltersValue {
  type: 'all' | 'income' | 'expense';
  status: 'all' | 'pending' | 'paid';
  categoryId: string;
  startDate: string;
  endDate: string;
}

export const DEFAULT_TRANSACTION_FILTERS: TransactionFiltersValue = {
  type: 'all',
  status: 'all',
  categoryId: '',
  startDate: '',
  endDate: '',
};

export function hasActiveTransactionFilters(filters: TransactionFiltersValue): boolean {
  return (
    filters.type !== DEFAULT_TRANSACTION_FILTERS.type ||
    filters.status !== DEFAULT_TRANSACTION_FILTERS.status ||
    filters.categoryId !== DEFAULT_TRANSACTION_FILTERS.categoryId ||
    filters.startDate !== DEFAULT_TRANSACTION_FILTERS.startDate ||
    filters.endDate !== DEFAULT_TRANSACTION_FILTERS.endDate
  );
}

export function toTransactionListFilters(filters: TransactionFiltersValue): TransactionListFilters {
  return {
    ...(filters.type !== 'all' ? { type: filters.type } : {}),
    ...(filters.status !== 'all' ? { status: filters.status } : {}),
    ...(filters.categoryId !== '' ? { categoryId: filters.categoryId } : {}),
    ...(filters.startDate !== '' ? { startDate: filters.startDate } : {}),
    ...(filters.endDate !== '' ? { endDate: filters.endDate } : {}),
  };
}

export interface TransactionRow {
  id: string;
  type: TransactionRecord['type'];
  amount: string;
  transactionDate: string;
  dueDate: string | null;
  description: string | null;
  status: TransactionRecord['status'];
  state: TransactionRowState;
  categoryName: string;
}

/**
 * Mirrors the backend's own overdue classification (`state=overdue`:
 * status pending AND dueDate < today) so the "Vencida" label shown here
 * never disagrees with what the `state` filter would return.
 */
export function deriveTransactionState(
  status: TransactionRecord['status'],
  dueDate: string | null,
  today: string,
): TransactionRowState {
  if (status === 'paid') {
    return 'paid';
  }

  return dueDate !== null && dueDate < today ? 'overdue' : 'pending';
}

export function buildCategoryNameMap(categories: Category[]): Map<string, string> {
  return new Map(categories.map((category) => [category.id, category.name]));
}

export function buildTransactionRows(
  transactions: TransactionRecord[],
  categoryNamesById: Map<string, string>,
  today: string,
): TransactionRow[] {
  return transactions.map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    transactionDate: transaction.transactionDate,
    dueDate: transaction.dueDate,
    description: transaction.description,
    status: transaction.status,
    state: deriveTransactionState(transaction.status, transaction.dueDate, today),
    categoryName:
      transaction.categoryId !== null
        ? (categoryNamesById.get(transaction.categoryId) ?? NO_CATEGORY_LABEL)
        : NO_CATEGORY_LABEL,
  }));
}
