import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getHouseholdSummary, listHouseholds } from './household-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('household-api', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('rejects a households response that does not match the expected shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'not-a-uuid' }] }));

    await expect(listHouseholds()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects a summary response with a malformed monetary value', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { totalIncome: '1000', totalExpense: '0.00', balance: '1000.00' } }),
    );

    await expect(getHouseholdSummary('9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10')).rejects.toMatchObject(
      { code: 'INVALID_RESPONSE' },
    );
  });
});
