import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listTransactions, transactionsQueryKey } from './transaction-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';

describe('transactionsQueryKey', () => {
  it('produces a deterministic key including householdId and params', () => {
    const params = { page: 1 };

    expect(transactionsQueryKey(HOUSEHOLD_ID, params)).toEqual([
      'transactions',
      HOUSEHOLD_ID,
      'list',
      params,
    ]);
  });
});

describe('listTransactions', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('requests the correct URL with page, limit, and filters', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], meta: { page: 2, limit: 20, total: 0, totalPages: 0 } }),
    );

    await listTransactions(HOUSEHOLD_ID, {
      page: 2,
      type: 'expense',
      status: 'pending',
      categoryId: 'cat-1',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toBe(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/transactions?page=2&limit=20&type=expense&status=pending&categoryId=cat-1&startDate=2026-09-01&endDate=2026-09-30`,
    );
  });

  it('omits filters that are not provided', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
    );

    await listTransactions(HOUSEHOLD_ID, { page: 1 });

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toBe(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/transactions?page=1&limit=20`,
    );
  });

  it('returns parsed transactions and pagination meta', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            type: 'expense',
            amount: '150.00',
            transactionDate: '2026-09-01',
            dueDate: '2026-09-20',
            categoryId: null,
            description: 'Conta de luz',
            status: 'pending',
          },
        ],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
    );

    const result = await listTransactions(HOUSEHOLD_ID, { page: 1 });

    expect(result.transactions).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('rejects a response that does not match the expected shape', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [{ id: 'not-a-uuid' }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
    );

    await expect(listTransactions(HOUSEHOLD_ID, { page: 1 })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
