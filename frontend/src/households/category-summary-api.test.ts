import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getHouseholdCategorySummary } from './category-summary-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('category-summary-api', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('requests the summary/categories endpoint with startDate and endDate', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await getHouseholdCategorySummary(
      '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10',
      '2026-09-01',
      '2026-09-30',
    );

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://localhost:3000/api/households/9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10/summary/categories?startDate=2026-09-01&endDate=2026-09-30',
    );
  });

  it('rejects a response that does not match the expected shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ categoryId: 'not-a-uuid' }] }));

    await expect(
      getHouseholdCategorySummary(
        '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10',
        '2026-09-01',
        '2026-09-30',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects an entry with a malformed monetary value', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [{ categoryId: null, categoryName: 'Sem categoria', totalExpense: '10' }],
      }),
    );

    await expect(
      getHouseholdCategorySummary(
        '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10',
        '2026-09-01',
        '2026-09-30',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('returns parsed entries with a null categoryId for uncategorized expenses', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [{ categoryId: null, categoryName: 'Sem categoria', totalExpense: '25.00' }],
      }),
    );

    const result = await getHouseholdCategorySummary(
      '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10',
      '2026-09-01',
      '2026-09-30',
    );

    expect(result).toEqual([
      { categoryId: null, categoryName: 'Sem categoria', totalExpense: '25.00' },
    ]);
  });
});
