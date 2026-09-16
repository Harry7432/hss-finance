import { describe, expect, it } from 'vitest';

import {
  selectUpcomingPayments,
  UPCOMING_PAYMENTS_DISPLAY_LIMIT,
} from './select-upcoming-payments';
import type { TransactionRecord } from './transaction-api';

const TODAY = '2026-09-15';

function transaction(overrides: Partial<TransactionRecord> & { id: string }): TransactionRecord {
  return {
    type: 'expense',
    amount: '100.00',
    dueDate: null,
    categoryId: null,
    description: 'Conta de luz',
    status: 'pending',
    ...overrides,
  };
}

describe('selectUpcomingPayments', () => {
  it('classifies backend-provided overdue records as overdue regardless of due date distance', () => {
    const overdue = [transaction({ id: 'overdue-1', dueDate: '2026-08-01' })];

    const result = selectUpcomingPayments({ overdue, pending: [] }, TODAY);

    expect(result).toEqual([expect.objectContaining({ id: 'overdue-1', state: 'overdue' })]);
  });

  it('labels a pending transaction due today as "today"', () => {
    const pending = [transaction({ id: 'due-today', dueDate: TODAY })];

    const result = selectUpcomingPayments({ overdue: [], pending }, TODAY);

    expect(result).toEqual([expect.objectContaining({ id: 'due-today', state: 'today' })]);
  });

  it('labels a pending transaction due after today as "future"', () => {
    const pending = [transaction({ id: 'due-future', dueDate: '2026-09-20' })];

    const result = selectUpcomingPayments({ overdue: [], pending }, TODAY);

    expect(result).toEqual([expect.objectContaining({ id: 'due-future', state: 'future' })]);
  });

  it('places overdue before pending, trusting each bucket is already dueDate-ascending from the backend', () => {
    // The backend now serves both requests with sortBy=dueDate&sortOrder=asc, so this
    // function must NOT re-sort — it only concatenates overdue ahead of pending. Inputs
    // here are given pre-sorted, exactly as the API layer receives them.
    const overdueOld = transaction({ id: 'overdue-old', dueDate: '2026-08-01' });
    const overdueRecent = transaction({ id: 'overdue-recent', dueDate: '2026-09-10' });
    const dueToday = transaction({ id: 'today', dueDate: TODAY });
    const dueFutureNear = transaction({ id: 'future-near', dueDate: '2026-09-16' });
    const dueFutureFar = transaction({ id: 'future-far', dueDate: '2026-10-01' });

    const result = selectUpcomingPayments(
      {
        overdue: [overdueOld, overdueRecent],
        pending: [dueToday, dueFutureNear, dueFutureFar],
      },
      TODAY,
    );

    expect(result.map((payment) => payment.id)).toEqual([
      'overdue-old',
      'overdue-recent',
      'today',
      'future-near',
      'future-far',
    ]);
  });

  it('does not re-sort a bucket, since ordering is the backend’s responsibility', () => {
    const first = transaction({ id: 'first', dueDate: '2026-09-25' });
    const second = transaction({ id: 'second', dueDate: '2026-09-16' });

    const result = selectUpcomingPayments({ overdue: [], pending: [first, second] }, TODAY);

    expect(result.map((payment) => payment.id)).toEqual(['first', 'second']);
  });

  it('excludes transactions without a due date', () => {
    const pending = [
      transaction({ id: 'no-due-date', dueDate: null }),
      transaction({ id: 'has-due-date', dueDate: '2026-09-20' }),
    ];

    const result = selectUpcomingPayments({ overdue: [], pending }, TODAY);

    expect(result.map((payment) => payment.id)).toEqual(['has-due-date']);
  });

  it('caps the result at the display limit, prioritizing overdue first', () => {
    const overdue = Array.from({ length: 3 }, (_, index) =>
      transaction({ id: `overdue-${index}`, dueDate: `2026-08-0${index + 1}` }),
    );
    const pending = Array.from({ length: 4 }, (_, index) =>
      transaction({ id: `pending-${index}`, dueDate: `2026-09-2${index}` }),
    );

    const result = selectUpcomingPayments({ overdue, pending }, TODAY);

    expect(result).toHaveLength(UPCOMING_PAYMENTS_DISPLAY_LIMIT);
    expect(result.map((payment) => payment.id)).toEqual([
      'overdue-0',
      'overdue-1',
      'overdue-2',
      'pending-0',
      'pending-1',
    ]);
  });

  it('returns an empty list when there is nothing pending or overdue with a due date', () => {
    expect(selectUpcomingPayments({ overdue: [], pending: [] }, TODAY)).toEqual([]);
  });
});
