import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTransaction, listTransactions, transactionsQueryKey } from './transaction-api';

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

function createdTransactionResponse(overrides: Record<string, unknown> = {}) {
  return jsonResponse(
    {
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'expense',
        amount: '150.90',
        transactionDate: '2026-09-13',
        dueDate: '2026-09-20',
        categoryId: null,
        description: 'Mercado',
        status: 'pending',
        paidAt: null,
        source: 'manual',
        expenseNature: null,
        recurringTransactionId: null,
        recurringPeriod: null,
        createdBy: '22222222-2222-4222-8222-222222222222',
        createdAt: '2026-09-13T12:00:00.000Z',
        updatedAt: '2026-09-13T12:00:00.000Z',
        ...overrides,
      },
    },
    201,
  );
}

describe('createTransaction', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  function lastRequestBody(): unknown {
    const options = fetchMock.mock.calls[0]?.[1];
    return JSON.parse(String(options?.body));
  }

  it('posts to the correct URL with method POST', async () => {
    fetchMock.mockResolvedValue(createdTransactionResponse());

    await createTransaction(HOUSEHOLD_ID, {
      type: 'expense',
      amount: '150.90',
      transactionDate: '2026-09-13',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/transactions`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends only type, amount, and transactionDate when nothing else is provided', async () => {
    fetchMock.mockResolvedValue(createdTransactionResponse());

    await createTransaction(HOUSEHOLD_ID, {
      type: 'expense',
      amount: '150.90',
      transactionDate: '2026-09-13',
    });

    expect(lastRequestBody()).toEqual({
      type: 'expense',
      amount: '150.90',
      transactionDate: '2026-09-13',
    });
  });

  it('sends the full expense payload including expenseNature', async () => {
    fetchMock.mockResolvedValue(createdTransactionResponse());

    await createTransaction(HOUSEHOLD_ID, {
      type: 'expense',
      amount: '150.90',
      transactionDate: '2026-09-13',
      dueDate: '2026-09-20',
      categoryId: '33333333-3333-4333-8333-333333333333',
      description: 'Mercado',
      status: 'paid',
      expenseNature: 'variable',
    });

    expect(lastRequestBody()).toEqual({
      type: 'expense',
      amount: '150.90',
      transactionDate: '2026-09-13',
      dueDate: '2026-09-20',
      categoryId: '33333333-3333-4333-8333-333333333333',
      description: 'Mercado',
      status: 'paid',
      expenseNature: 'variable',
    });
  });

  it('never sends expenseNature for an income, even if passed', async () => {
    fetchMock.mockResolvedValue(createdTransactionResponse({ type: 'income' }));

    await createTransaction(HOUSEHOLD_ID, {
      type: 'income',
      amount: '3000.00',
      transactionDate: '2026-09-13',
      expenseNature: 'fixed',
    });

    const body = lastRequestBody() as Record<string, unknown>;
    expect(body).not.toHaveProperty('expenseNature');
  });

  it('sends explicit null for nullable fields when provided as null', async () => {
    fetchMock.mockResolvedValue(createdTransactionResponse());

    await createTransaction(HOUSEHOLD_ID, {
      type: 'expense',
      amount: '10.00',
      transactionDate: '2026-09-13',
      dueDate: null,
      categoryId: null,
      description: null,
    });

    expect(lastRequestBody()).toEqual({
      type: 'expense',
      amount: '10.00',
      transactionDate: '2026-09-13',
      dueDate: null,
      categoryId: null,
      description: null,
    });
  });

  it('returns the parsed created transaction', async () => {
    fetchMock.mockResolvedValue(createdTransactionResponse({ description: 'Mercado' }));

    const result = await createTransaction(HOUSEHOLD_ID, {
      type: 'expense',
      amount: '150.90',
      transactionDate: '2026-09-13',
    });

    expect(result).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      type: 'expense',
      amount: '150.90',
      description: 'Mercado',
    });
  });

  it('rejects a created-transaction response that does not match the expected shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: 'not-a-uuid' } }, 201));

    await expect(
      createTransaction(HOUSEHOLD_ID, {
        type: 'expense',
        amount: '150.90',
        transactionDate: '2026-09-13',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('propagates the backend error for an invalid category', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'INVALID_CATEGORY', message: 'Invalid category' } }, 400),
    );

    await expect(
      createTransaction(HOUSEHOLD_ID, {
        type: 'expense',
        amount: '150.90',
        transactionDate: '2026-09-13',
        categoryId: '33333333-3333-4333-8333-333333333333',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_CATEGORY' });
  });
});
