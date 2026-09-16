import type { TransactionRecord } from './transaction-api';

export const UPCOMING_PAYMENTS_DISPLAY_LIMIT = 5;

export type UpcomingPaymentState = 'overdue' | 'today' | 'future';

export interface UpcomingPayment {
  id: string;
  type: TransactionRecord['type'];
  amount: string;
  dueDate: string;
  description: string | null;
  state: UpcomingPaymentState;
}

function withDueDate(
  transactions: TransactionRecord[],
): (TransactionRecord & { dueDate: string })[] {
  return transactions.filter(
    (transaction): transaction is TransactionRecord & { dueDate: string } =>
      transaction.dueDate !== null,
  );
}

/**
 * Builds the "upcoming payments" list shown on the dashboard.
 *
 * The backend is the sole source of truth both for what counts as overdue vs
 * pending (the `overdue`/`pending` buckets passed in here come from two
 * separately filtered requests using the backend's own `state` filter) and
 * for ordering (both requests use `sortBy=dueDate&sortOrder=asc`, so each
 * bucket already arrives sorted ascending by dueDate, NULLS LAST). This
 * function only combines the two buckets and decides the "vence hoje" label,
 * neither of which changes that classification:
 *
 * - Priority: overdue first, then pending — which already yields "due today"
 *   before "future" since the backend sorted it ascending by dueDate.
 * - Items without a dueDate are excluded: they aren't "upcoming" in any
 *   meaningful sense (only `pending` can contain them; `overdue` requires a
 *   non-null dueDate by definition).
 */
export function selectUpcomingPayments(
  candidates: { overdue: TransactionRecord[]; pending: TransactionRecord[] },
  today: string,
  limit: number = UPCOMING_PAYMENTS_DISPLAY_LIMIT,
): UpcomingPayment[] {
  const overdue = withDueDate(candidates.overdue);
  const pending = withDueDate(candidates.pending);
  const overdueIds = new Set(overdue.map((transaction) => transaction.id));

  return [...overdue, ...pending].slice(0, limit).map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    dueDate: transaction.dueDate,
    description: transaction.description,
    state: overdueIds.has(transaction.id)
      ? 'overdue'
      : transaction.dueDate === today
        ? 'today'
        : 'future',
  }));
}
