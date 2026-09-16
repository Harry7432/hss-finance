import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCategory,
  deleteCategory,
  listHouseholdCategories,
  updateCategory,
} from './category-api';

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

function categoryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Mercado',
    type: 'expense',
    color: null,
    icon: null,
    isDefault: false,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('createCategory', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('posts the name and type to the categories endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: categoryRecord() }, 201));

    await createCategory(HOUSEHOLD_ID, { name: 'Mercado', type: 'expense' });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/categories`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Mercado', type: 'expense' }),
      }),
    );
  });

  it('returns the created category', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: categoryRecord({ name: 'Lazer' }) }, 201));

    const category = await createCategory(HOUSEHOLD_ID, { name: 'Lazer', type: 'expense' });

    expect(category.name).toBe('Lazer');
  });

  it('rejects with the backend error code on a 409 duplicate', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'CATEGORY_ALREADY_EXISTS', message: 'duplicate' } }, 409),
    );

    await expect(
      createCategory(HOUSEHOLD_ID, { name: 'Mercado', type: 'expense' }),
    ).rejects.toMatchObject({ code: 'CATEGORY_ALREADY_EXISTS', status: 409 });
  });
});

describe('updateCategory', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('patches only the name to the category endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: categoryRecord({ name: 'Supermercado' }) }));

    await updateCategory(HOUSEHOLD_ID, CATEGORY_ID, { name: 'Supermercado' });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/categories/${CATEGORY_ID}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Supermercado' }),
      }),
    );
  });

  it('rejects with the backend error code on a 404', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'CATEGORY_NOT_FOUND', message: 'not found' } }, 404),
    );

    await expect(
      updateCategory(HOUSEHOLD_ID, CATEGORY_ID, { name: 'Supermercado' }),
    ).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND', status: 404 });
  });
});

describe('deleteCategory', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('sends a DELETE request to the category endpoint', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await deleteCategory(HOUSEHOLD_ID, CATEGORY_ID);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/categories/${CATEGORY_ID}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('rejects with the backend error code when the category is in use', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'CATEGORY_IN_USE', message: 'in use' } }, 409),
    );

    await expect(deleteCategory(HOUSEHOLD_ID, CATEGORY_ID)).rejects.toMatchObject({
      code: 'CATEGORY_IN_USE',
      status: 409,
    });
  });

  it('rejects with 403 when the requester is not an owner', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403),
    );

    await expect(deleteCategory(HOUSEHOLD_ID, CATEGORY_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });
});
