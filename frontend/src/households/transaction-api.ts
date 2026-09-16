import { z } from 'zod';

import { ApiError } from '../lib/api-error';
import { apiRequest, apiRequestPaginated, type PaginationMeta } from '../lib/http';
import { monetaryAmountSchema } from './household-api';

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const transactionRecordSchema = z.object({
  id: z.uuid(),
  type: z.enum(['income', 'expense']),
  amount: monetaryAmountSchema,
  transactionDate: dateOnlySchema,
  dueDate: dateOnlySchema.nullable(),
  categoryId: z.uuid().nullable(),
  description: z.string().nullable(),
  status: z.enum(['pending', 'paid']),
});

export type TransactionRecord = z.infer<typeof transactionRecordSchema>;

export const TRANSACTIONS_PAGE_SIZE = 20;

export interface TransactionListFilters {
  type?: 'income' | 'expense';
  status?: 'pending' | 'paid';
  categoryId?: string;
  startDate?: string;
  endDate?: string;
}

export interface TransactionListParams extends TransactionListFilters {
  page: number;
}

export interface TransactionListResult {
  transactions: TransactionRecord[];
  meta: PaginationMeta;
}

export function transactionsQueryKey(
  householdId: string | undefined,
  params: TransactionListParams,
) {
  return ['transactions', householdId, 'list', params] as const;
}

function buildTransactionListQuery(params: TransactionListParams): URLSearchParams {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(TRANSACTIONS_PAGE_SIZE),
  });

  if (params.type !== undefined) {
    query.set('type', params.type);
  }

  if (params.status !== undefined) {
    query.set('status', params.status);
  }

  if (params.categoryId !== undefined) {
    query.set('categoryId', params.categoryId);
  }

  if (params.startDate !== undefined) {
    query.set('startDate', params.startDate);
  }

  if (params.endDate !== undefined) {
    query.set('endDate', params.endDate);
  }

  return query;
}

export async function listTransactions(
  householdId: string,
  params: TransactionListParams,
): Promise<TransactionListResult> {
  const query = buildTransactionListQuery(params);
  const result = await apiRequestPaginated<unknown>(
    `/households/${householdId}/transactions?${query.toString()}`,
  );
  const parsedResult = z.array(transactionRecordSchema).safeParse(result.data);

  if (!parsedResult.success) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return { transactions: parsedResult.data, meta: result.meta };
}

export interface CreateTransactionInput {
  type: 'income' | 'expense';
  amount: string;
  transactionDate: string;
  dueDate?: string | null;
  categoryId?: string | null;
  description?: string | null;
  status?: 'pending' | 'paid';
  /** Only ever sent for `type: 'expense'` — the backend rejects it for income. */
  expenseNature?: 'fixed' | 'variable' | null;
}

export async function createTransaction(
  householdId: string,
  input: CreateTransactionInput,
): Promise<TransactionRecord> {
  const body: Record<string, unknown> = {
    type: input.type,
    amount: input.amount,
    transactionDate: input.transactionDate,
  };

  if (input.dueDate !== undefined) {
    body.dueDate = input.dueDate;
  }

  if (input.categoryId !== undefined) {
    body.categoryId = input.categoryId;
  }

  if (input.description !== undefined) {
    body.description = input.description;
  }

  if (input.status !== undefined) {
    body.status = input.status;
  }

  if (input.type === 'expense' && input.expenseNature !== undefined) {
    body.expenseNature = input.expenseNature;
  }

  const result = await apiRequest<unknown>(`/households/${householdId}/transactions`, {
    method: 'POST',
    body,
  });
  const parsedResult = transactionRecordSchema.safeParse(result);

  if (!parsedResult.success) {
    throw new ApiError(201, 'INVALID_RESPONSE', 'O servidor retornou uma resposta inválida.');
  }

  return parsedResult.data;
}

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
