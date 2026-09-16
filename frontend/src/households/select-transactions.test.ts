import { describe, expect, it } from 'vitest';

import {
  buildCategoryNameMap,
  buildTransactionRows,
  DEFAULT_TRANSACTION_FILTERS,
  deriveTransactionState,
  hasActiveTransactionFilters,
  toTransactionListFilters,
} from './select-transactions';
import type { TransactionRecord } from './transaction-api';

function transactionRecord(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'expense',
    amount: '150.00',
    transactionDate: '2026-09-01',
    dueDate: null,
    categoryId: null,
    description: 'Conta de luz',
    status: 'pending',
    ...overrides,
  };
}

describe('deriveTransactionState', () => {
  it('returns paid when the transaction is paid, regardless of dueDate', () => {
    expect(deriveTransactionState('paid', '2026-09-01', '2026-09-16')).toBe('paid');
  });

  it('returns pending when there is no dueDate', () => {
    expect(deriveTransactionState('pending', null, '2026-09-16')).toBe('pending');
  });

  it('returns pending when the dueDate has not passed yet', () => {
    expect(deriveTransactionState('pending', '2026-09-16', '2026-09-16')).toBe('pending');
    expect(deriveTransactionState('pending', '2026-09-20', '2026-09-16')).toBe('pending');
  });

  it('returns overdue when the dueDate is before today', () => {
    expect(deriveTransactionState('pending', '2026-09-10', '2026-09-16')).toBe('overdue');
  });
});

describe('buildCategoryNameMap', () => {
  it('maps category ids to names', () => {
    const map = buildCategoryNameMap([
      {
        id: 'cat-1',
        name: 'Mercado',
        type: 'expense',
        color: null,
        icon: null,
        isDefault: false,
        createdAt: '2026-09-01T12:00:00.000Z',
        updatedAt: '2026-09-01T12:00:00.000Z',
      },
    ]);

    expect(map.get('cat-1')).toBe('Mercado');
  });
});

describe('buildTransactionRows', () => {
  it('resolves the category name from the map', () => {
    const map = new Map([['cat-1', 'Mercado']]);
    const rows = buildTransactionRows(
      [transactionRecord({ categoryId: 'cat-1' })],
      map,
      '2026-09-16',
    );

    expect(rows[0]?.categoryName).toBe('Mercado');
  });

  it('falls back to "Sem categoria" when categoryId is null', () => {
    const rows = buildTransactionRows(
      [transactionRecord({ categoryId: null })],
      new Map(),
      '2026-09-16',
    );

    expect(rows[0]?.categoryName).toBe('Sem categoria');
  });

  it('falls back to "Sem categoria" when the category id is not in the map', () => {
    const rows = buildTransactionRows(
      [transactionRecord({ categoryId: 'unknown-category' })],
      new Map(),
      '2026-09-16',
    );

    expect(rows[0]?.categoryName).toBe('Sem categoria');
  });

  it('attaches the derived state to each row', () => {
    const rows = buildTransactionRows(
      [transactionRecord({ status: 'pending', dueDate: '2026-09-01' })],
      new Map(),
      '2026-09-16',
    );

    expect(rows[0]?.state).toBe('overdue');
  });
});

describe('hasActiveTransactionFilters', () => {
  it('returns false for the default filters', () => {
    expect(hasActiveTransactionFilters(DEFAULT_TRANSACTION_FILTERS)).toBe(false);
  });

  it('returns true when any filter differs from the default', () => {
    expect(hasActiveTransactionFilters({ ...DEFAULT_TRANSACTION_FILTERS, type: 'income' })).toBe(
      true,
    );
    expect(hasActiveTransactionFilters({ ...DEFAULT_TRANSACTION_FILTERS, status: 'paid' })).toBe(
      true,
    );
    expect(
      hasActiveTransactionFilters({ ...DEFAULT_TRANSACTION_FILTERS, categoryId: 'cat-1' }),
    ).toBe(true);
    expect(
      hasActiveTransactionFilters({ ...DEFAULT_TRANSACTION_FILTERS, startDate: '2026-09-01' }),
    ).toBe(true);
    expect(
      hasActiveTransactionFilters({ ...DEFAULT_TRANSACTION_FILTERS, endDate: '2026-09-30' }),
    ).toBe(true);
  });
});

describe('toTransactionListFilters', () => {
  it('produces no filter fields for the default value', () => {
    expect(toTransactionListFilters(DEFAULT_TRANSACTION_FILTERS)).toEqual({});
  });

  it('maps each set filter to its API field', () => {
    expect(
      toTransactionListFilters({
        type: 'expense',
        status: 'pending',
        categoryId: 'cat-1',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      }),
    ).toEqual({
      type: 'expense',
      status: 'pending',
      categoryId: 'cat-1',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
  });
});
