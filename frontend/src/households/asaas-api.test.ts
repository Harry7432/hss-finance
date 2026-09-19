import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAsaasBalance,
  getPaymentAttempt,
  listAsaasFinancialTransactions,
  payBill,
  simulateBillPayment,
} from './asaas-api';

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';
const TRANSACTION_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('asaas-api', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('getAsaasBalance requests the balance endpoint and parses the response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { balance: 123.45 } }));

    const balance = await getAsaasBalance(HOUSEHOLD_ID);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/integrations/asaas/balance`,
    );
    expect(balance).toEqual({ balance: 123.45 });
  });

  it('listAsaasFinancialTransactions requests a bounded page and parses the response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: { transactions: [], totalCount: 0, hasMore: false, offset: 0, limit: 20 },
      }),
    );

    await listAsaasFinancialTransactions(HOUSEHOLD_ID);

    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toBe(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/integrations/asaas/financial-transactions?limit=20`,
    );
  });

  it('simulateBillPayment posts the identification field and never puts it in the URL', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          transaction: { id: TRANSACTION_ID, amount: '150.00', status: 'pending' },
          simulation: {
            value: 150,
            dueDate: '2026-09-20',
            originalValue: null,
            isOverdue: null,
            allowChangeValue: null,
            minValue: null,
            maxValue: null,
            beneficiaryName: null,
            companyName: null,
            fee: null,
            minimumScheduleDate: null,
          },
          amountMatchesTransaction: true,
        },
      }),
    );

    const identificationField = '03399.77779 29900.000000 04751.101017 1 81510000002990';
    await simulateBillPayment(HOUSEHOLD_ID, TRANSACTION_ID, identificationField);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/transactions/${TRANSACTION_ID}/payment/bill/simulate`,
    );
    expect(String(url)).not.toContain(identificationField);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ identificationField });
  });

  it('payBill posts to the bill payment endpoint', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          paymentAttempt: { id: TRANSACTION_ID, status: 'processing', kind: 'bill' },
          provider: { status: 'PENDING' },
        },
      }),
    );

    const result = await payBill(HOUSEHOLD_ID, TRANSACTION_ID, 'field');

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/transactions/${TRANSACTION_ID}/payment/bill`,
    );
    expect(result.paymentAttempt.status).toBe('processing');
  });

  it('getPaymentAttempt returns null when the backend reports no attempt yet', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: null }));

    const attempt = await getPaymentAttempt(HOUSEHOLD_ID, TRANSACTION_ID);

    expect(attempt).toBeNull();
  });

  it('getPaymentAttempt parses an existing attempt', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          id: TRANSACTION_ID,
          status: 'uncertain',
          kind: 'bill',
          createdAt: '2026-09-18T12:00:00.000Z',
          updatedAt: '2026-09-18T12:05:00.000Z',
          confirmedAt: null,
        },
      }),
    );

    const attempt = await getPaymentAttempt(HOUSEHOLD_ID, TRANSACTION_ID);

    expect(attempt?.status).toBe('uncertain');
  });
});
