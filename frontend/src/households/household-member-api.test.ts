import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addHouseholdMember, listHouseholdMembers } from './household-member-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

const HOUSEHOLD_ID = '9c6a6e2e-df3a-4a4c-9d8c-3a2a4a2e0e10';

function memberRecord(overrides: Record<string, unknown> = {}) {
  return {
    userId: '33333333-3333-4333-8333-333333333333',
    name: 'Harry Sousa',
    email: 'harry@example.com',
    role: 'owner',
    joinedAt: '2026-09-13T15:00:00.000Z',
    ...overrides,
  };
}

describe('listHouseholdMembers', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('requests the members endpoint for the household', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));

    await listHouseholdMembers(HOUSEHOLD_ID);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/members`,
      expect.anything(),
    );
  });

  it('returns parsed members', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [memberRecord()] }));

    const members = await listHouseholdMembers(HOUSEHOLD_ID);

    expect(members).toHaveLength(1);
    expect(members[0]?.name).toBe('Harry Sousa');
    expect(members[0]?.role).toBe('owner');
  });

  it('rejects a response that does not match the expected shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ userId: 'not-a-uuid' }] }));

    await expect(listHouseholdMembers(HOUSEHOLD_ID)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('rejects with 403 when the requester has no membership', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403),
    );

    await expect(listHouseholdMembers(HOUSEHOLD_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
  });
});

describe('addHouseholdMember', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('posts the email to the members endpoint', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: memberRecord({ role: 'member' }) }, 201),
    );

    await addHouseholdMember(HOUSEHOLD_ID, { email: 'membro@example.com' });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/households/${HOUSEHOLD_ID}/members`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'membro@example.com' }),
      }),
    );
  });

  it('returns the added member', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { data: memberRecord({ name: 'Novo Membro', role: 'member' }) },
        201,
      ),
    );

    const member = await addHouseholdMember(HOUSEHOLD_ID, { email: 'membro@example.com' });

    expect(member.name).toBe('Novo Membro');
    expect(member.role).toBe('member');
  });

  it('rejects with USER_NOT_FOUND on a 404', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'USER_NOT_FOUND', message: 'User not found' } }, 404),
    );

    await expect(
      addHouseholdMember(HOUSEHOLD_ID, { email: 'missing@example.com' }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', status: 404 });
  });

  it('rejects with ALREADY_HOUSEHOLD_MEMBER on a 409', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'ALREADY_HOUSEHOLD_MEMBER', message: 'User is already a household member' } },
        409,
      ),
    );

    await expect(
      addHouseholdMember(HOUSEHOLD_ID, { email: 'membro@example.com' }),
    ).rejects.toMatchObject({ code: 'ALREADY_HOUSEHOLD_MEMBER', status: 409 });
  });

  it('rejects with 403 when the requester is not an owner', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403),
    );

    await expect(
      addHouseholdMember(HOUSEHOLD_ID, { email: 'membro@example.com' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});
