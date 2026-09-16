import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getHouseholdMonthlySummary } from './monthly-summary-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('monthly-summary-api', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('requests the summary/monthly endpoint with no query parameters', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await getHouseholdMonthlySummary('9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10');

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://localhost:3000/api/households/9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10/summary/monthly',
    );
  });

  it('rejects a response that does not match the expected shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ month: 'not-a-month' }] }));

    await expect(
      getHouseholdMonthlySummary('9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10'),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects an entry with a malformed monetary value', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [{ month: '2026-09', totalIncome: '10', totalExpense: '0.00', balance: '10.00' }],
      }),
    );

    await expect(
      getHouseholdMonthlySummary('9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10'),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('returns parsed monthly entries in order', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          { month: '2026-08', totalIncome: '1000.00', totalExpense: '400.00', balance: '600.00' },
          { month: '2026-09', totalIncome: '500.00', totalExpense: '700.00', balance: '-200.00' },
        ],
      }),
    );

    const result = await getHouseholdMonthlySummary('9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10');

    expect(result).toEqual([
      { month: '2026-08', totalIncome: '1000.00', totalExpense: '400.00', balance: '600.00' },
      { month: '2026-09', totalIncome: '500.00', totalExpense: '700.00', balance: '-200.00' },
    ]);
  });
});
