import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listHouseholdCategories } from './category-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';

describe('listHouseholdCategories', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('requests the categories endpoint for the household, without a type filter', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await listHouseholdCategories(HOUSEHOLD_ID);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/categories`,
      expect.anything(),
    );
  });

  it('returns parsed categories', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            name: 'Mercado',
            type: 'expense',
            color: '#35D6C4',
            icon: null,
            isDefault: true,
            createdAt: '2026-09-01T12:00:00.000Z',
            updatedAt: '2026-09-01T12:00:00.000Z',
          },
        ],
      }),
    );

    const categories = await listHouseholdCategories(HOUSEHOLD_ID);

    expect(categories).toHaveLength(1);
    expect(categories[0]?.name).toBe('Mercado');
  });

  it('rejects a response that does not match the expected shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ id: 'not-a-uuid' }] }));

    await expect(listHouseholdCategories(HOUSEHOLD_ID)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
