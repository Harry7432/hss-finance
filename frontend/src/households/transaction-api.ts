import { z } from 'zod';

import { ApiError } from '../lib/api-error';
import { apiRequest } from '../lib/http';
import { monetaryAmountSchema } from './household-api';

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const transactionRecordSchema = z.object({
  id: z.uuid(),
  type: z.enum(['income', 'expense']),
  amount: monetaryAmountSchema,
  dueDate: dateOnlySchema.nullable(),
  categoryId: z.uuid().nullable(),
  description: z.string().nullable(),
  status: z.enum(['pending', 'paid']),
});

export type TransactionRecord = z.infer<typeof transactionRecordSchema>;

/**
 * The `/households/:householdId/transactions` endpoint accepts `sortBy=dueDate`
 * (optionally `sortOrder=asc|desc`, defaulting to ascending) to order rows by
 * dueDate NULLS LAST instead of the default transactionDate DESC. Combined
 * with the dashboard's own 5-item display cap, each state only ever needs
 * its 5 soonest-due rows — there is no need to over-fetch and re-sort
 * client-side.
 */
export const UPCOMING_TRANSACTIONS_FETCH_LIMIT = 5;

function upcomingTransactionsQueryParams() {
  return { sortBy: 'dueDate', sortOrder: 'asc', limit: UPCOMING_TRANSACTIONS_FETCH_LIMIT } as const;
}

export function upcomingTransactionsQueryKey(householdId: string | undefined) {
  return ['transactions', householdId, 'upcoming', upcomingTransactionsQueryParams()] as const;
}

async function listTransactionsByState(
  householdId: string,
  state: 'pending' | 'overdue',
): Promise<TransactionRecord[]> {
  const query = new URLSearchParams({
    state,
    sortBy: 'dueDate',
    sortOrder: 'asc',
    limit: String(UPCOMING_TRANSACTIONS_FETCH_LIMIT),
    page: '1',
  });
  const result = await apiRequest<unknown>(
    `/households/${householdId}/transactions?${query.toString()}`,
  );
  const parsedResult = z.array(transactionRecordSchema).safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}

export interface UpcomingTransactionCandidates {
  overdue: TransactionRecord[];
  pending: TransactionRecord[];
}

export async function getUpcomingTransactionCandidates(
  householdId: string,
): Promise<UpcomingTransactionCandidates> {
  const [overdue, pending] = await Promise.all([
    listTransactionsByState(householdId, 'overdue'),
    listTransactionsByState(householdId, 'pending'),
  ]);

  return { overdue, pending };
}
