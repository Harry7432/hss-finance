import { randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';
import request from 'supertest';
import type { DataSource, EntityManager } from 'typeorm';

import { createApp } from '../src/app.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';
import { HouseholdMemberEntity } from '../src/database/entities/household-member.entity.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import type {
  CreatedHousehold,
  CreateHouseholdData,
  HouseholdRepository,
  ListedHousehold,
  ListedHouseholdMember,
} from '../src/repositories/household-repository.js';
import { TypeOrmHouseholdRepository } from '../src/repositories/household-repository.js';
import type { CreateUserData, UserRepository } from '../src/repositories/user-repository.js';

const TEST_JWT_SECRET = Buffer.alloc(32, 1);
const AUTHENTICATED_USER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();
const database: DatabaseReadiness = {
  async isReady(): Promise<boolean> {
    return true;
  },
};

interface StoredHousehold {
  id: string;
  name: string;
  currencyCode: string;
  createdBy: string;
  createdAt: Date;
}

interface StoredMembership {
  householdId: string;
  userId: string;
  role: 'owner' | 'member';
  joinedAt?: Date;
  name?: string;
  email?: string;
  passwordHash?: string;
}

class StubUserRepository implements UserRepository {
  async findByEmail(_email: string): Promise<UserEntity | null> {
    return null;
  }

  async findById(_id: string): Promise<UserEntity | null> {
    return null;
  }

  async create(_data: CreateUserData): Promise<UserEntity> {
    throw new Error('Not implemented in household tests.');
  }
}

class InMemoryHouseholdRepository implements HouseholdRepository {
  readonly households: StoredHousehold[] = [];
  readonly memberships: StoredMembership[] = [];

  constructor(
    private readonly existingUserId: string | null = AUTHENTICATED_USER_ID,
    private readonly membershipError?: Error,
    private readonly listError?: Error,
    private readonly memberListError?: Error,
  ) {}

  async createWithOwner(data: CreateHouseholdData): Promise<CreatedHousehold | null> {
    if (data.creatorId !== this.existingUserId) {
      return null;
    }

    const household: StoredHousehold = {
      id: randomUUID(),
      name: data.name,
      currencyCode: 'BRL',
      createdBy: data.creatorId,
      createdAt: new Date('2026-09-13T15:00:00.000Z'),
    };

    if (this.membershipError) {
      throw this.membershipError;
    }

    this.households.push(household);
    this.memberships.push({
      householdId: household.id,
      userId: data.creatorId,
      role: 'owner',
    });

    return {
      id: household.id,
      name: household.name,
      currencyCode: household.currencyCode,
      role: 'owner',
      createdAt: household.createdAt,
    };
  }

  async listForMember(userId: string): Promise<ListedHousehold[]> {
    if (this.listError) {
      throw this.listError;
    }

    const rows = this.memberships
      .filter((membership) => membership.userId === userId)
      .map((membership) => {
        const household = this.households.find(
          (candidate) => candidate.id === membership.householdId,
        );

        if (!household) {
          return null;
        }

        return {
          id: household.id,
          name: household.name,
          currencyCode: household.currencyCode,
          role: membership.role,
          createdAt: household.createdAt,
        };
      })
      .filter((row): row is ListedHousehold => row !== null);

    rows.sort(
      (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id),
    );

    return rows;
  }

  async listMembersForMember(
    householdId: string,
    userId: string,
  ): Promise<ListedHouseholdMember[] | null> {
    if (this.memberListError) {
      throw this.memberListError;
    }

    const viewerMembership = this.memberships.find(
      (membership) => membership.householdId === householdId && membership.userId === userId,
    );

    if (!viewerMembership) {
      return null;
    }

    return this.memberships
      .filter((membership) => membership.householdId === householdId)
      .map((membership) => ({
        userId: membership.userId,
        name: membership.name ?? 'Household member',
        email: membership.email ?? 'member@example.com',
        role: membership.role,
        joinedAt: membership.joinedAt ?? new Date('2026-09-13T15:00:00.000Z'),
      }))
      .sort(
        (left, right) =>
          Number(left.role === 'member') - Number(right.role === 'member') ||
          left.joinedAt.getTime() - right.joinedAt.getTime() ||
          left.userId.localeCompare(right.userId),
      );
  }
}

async function createToken(userId: string): Promise<string> {
  return new SignJWT({ email: 'harry@example.com' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(TEST_JWT_SECRET);
}

function createTestApp(households: HouseholdRepository) {
  return createApp(database, new StubUserRepository(), TEST_JWT_SECRET, households);
}

describe('POST /api/households', () => {
  it('atomically persists a BRL household and its authenticated creator as owner', async () => {
    const households = new InMemoryHouseholdRepository();
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post('/api/households')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '  Casa Sousa  ' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        id: expect.any(String),
        name: 'Casa Sousa',
        currencyCode: 'BRL',
        role: 'owner',
        createdAt: '2026-09-13T15:00:00.000Z',
      },
    });
    expect(households.households).toEqual([
      {
        id: response.body.data.id,
        name: 'Casa Sousa',
        currencyCode: 'BRL',
        createdBy: AUTHENTICATED_USER_ID,
        createdAt: new Date('2026-09-13T15:00:00.000Z'),
      },
    ]);
    expect(households.memberships).toEqual([
      {
        householdId: response.body.data.id,
        userId: AUTHENTICATED_USER_ID,
        role: 'owner',
      },
    ]);
    expect(response.body.data).not.toHaveProperty('createdBy');
  });

  it.each([
    ['an empty name', { name: '   ' }],
    ['an unknown field', { name: 'Casa Sousa', currencyCode: 'USD' }],
  ])('returns 400 for %s', async (_caseName, payload) => {
    const households = new InMemoryHouseholdRepository();
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post('/api/households')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
      },
    });
    expect(households.households).toHaveLength(0);
  });

  it('returns 401 without an access token', async () => {
    const app = createTestApp(new InMemoryHouseholdRepository());

    const response = await request(app).post('/api/households').send({ name: 'Casa Sousa' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  });

  it('returns 401 for an invalid access token', async () => {
    const app = createTestApp(new InMemoryHouseholdRepository());

    const response = await request(app)
      .post('/api/households')
      .set('Authorization', 'Bearer invalid-token')
      .send({ name: 'Casa Sousa' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('ignores identity fields outside the validated JWT subject', async () => {
    const households = new InMemoryHouseholdRepository();
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households?userId=${OTHER_USER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Casa Sousa' });

    expect(response.status).toBe(201);
    expect(households.households[0]?.createdBy).toBe(AUTHENTICATED_USER_ID);
    expect(households.memberships[0]?.userId).toBe(AUTHENTICATED_USER_ID);
  });

  it('rejects attempts to mass assign ownership fields through the body', async () => {
    const households = new InMemoryHouseholdRepository();
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post('/api/households')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Casa Sousa',
        createdBy: OTHER_USER_ID,
        userId: OTHER_USER_ID,
        role: 'member',
      });

    expect(response.status).toBe(400);
    expect(households.households).toHaveLength(0);
  });

  it('returns 401 when the authenticated user no longer exists', async () => {
    const app = createTestApp(new InMemoryHouseholdRepository(null));
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post('/api/households')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Casa Sousa' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('does not retain the household and sanitizes the error when membership creation fails', async () => {
    const households = new InMemoryHouseholdRepository(
      AUTHENTICATED_USER_ID,
      new Error('membership database details'),
    );
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post('/api/households')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Casa Sousa' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('membership database details');
    expect(households.households).toHaveLength(0);
    expect(households.memberships).toHaveLength(0);
  });
});

describe('GET /api/households', () => {
  function seedHousehold(
    households: InMemoryHouseholdRepository,
    data: {
      id: string;
      name: string;
      createdBy: string;
      createdAt: Date;
      membershipUserId?: string;
      membershipRole?: 'owner' | 'member';
    },
  ): void {
    households.households.push({
      id: data.id,
      name: data.name,
      currencyCode: 'BRL',
      createdBy: data.createdBy,
      createdAt: data.createdAt,
    });

    if (data.membershipUserId) {
      households.memberships.push({
        householdId: data.id,
        userId: data.membershipUserId,
        role: data.membershipRole ?? 'owner',
      });
    }
  }

  it('returns 200 for an authenticated user with no households', async () => {
    const households = new InMemoryHouseholdRepository();
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get('/api/households')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
  });

  it('returns only the households the authenticated user is a member of', async () => {
    const households = new InMemoryHouseholdRepository();
    seedHousehold(households, {
      id: randomUUID(),
      name: 'Casa Sousa',
      createdBy: OTHER_USER_ID,
      createdAt: new Date('2026-09-13T15:00:00.000Z'),
      membershipUserId: AUTHENTICATED_USER_ID,
    });
    seedHousehold(households, {
      id: randomUUID(),
      name: 'Casa Martins',
      createdBy: OTHER_USER_ID,
      createdAt: new Date('2026-09-12T15:00:00.000Z'),
      membershipUserId: OTHER_USER_ID,
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get('/api/households')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      id: expect.any(String),
      name: 'Casa Sousa',
      currencyCode: 'BRL',
    });
    expect(response.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Casa Martins' })]),
    );
  });

  it('does not return a household of another user without membership', async () => {
    const households = new InMemoryHouseholdRepository();
    seedHousehold(households, {
      id: randomUUID(),
      name: 'Casa Martins',
      createdBy: OTHER_USER_ID,
      createdAt: new Date('2026-09-13T15:00:00.000Z'),
      membershipUserId: OTHER_USER_ID,
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get('/api/households')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
  });

  it('returns a household created by another user when the authenticated user is a member', async () => {
    const households = new InMemoryHouseholdRepository();
    seedHousehold(households, {
      id: randomUUID(),
      name: 'Casa Sousa',
      createdBy: OTHER_USER_ID,
      createdAt: new Date('2026-09-13T15:00:00.000Z'),
      membershipUserId: AUTHENTICATED_USER_ID,
      membershipRole: 'member',
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get('/api/households')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ name: 'Casa Sousa', role: 'member' });
  });

  it('returns the owner role for the households the user owns', async () => {
    const households = new InMemoryHouseholdRepository();
    seedHousehold(households, {
      id: randomUUID(),
      name: 'Casa Sousa',
      createdBy: AUTHENTICATED_USER_ID,
      createdAt: new Date('2026-09-13T15:00:00.000Z'),
      membershipUserId: AUTHENTICATED_USER_ID,
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get('/api/households')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      id: expect.any(String),
      name: 'Casa Sousa',
      role: 'owner',
    });
  });

  it('exposes the member role alongside the household', async () => {
    const households = new InMemoryHouseholdRepository();
    seedHousehold(households, {
      id: randomUUID(),
      name: 'Casa Sousa',
      createdBy: OTHER_USER_ID,
      createdAt: new Date('2026-09-13T15:00:00.000Z'),
      membershipUserId: AUTHENTICATED_USER_ID,
      membershipRole: 'member',
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get('/api/households')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      id: expect.any(String),
      name: 'Casa Sousa',
      role: 'member',
    });
  });

  it('does not grant access to a household created by the user without a membership', async () => {
    const households = new InMemoryHouseholdRepository();
    seedHousehold(households, {
      id: randomUUID(),
      name: 'Casa Orfã',
      createdBy: AUTHENTICATED_USER_ID,
      createdAt: new Date('2026-09-13T15:00:00.000Z'),
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get('/api/households')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
  });

  it('does not leak created_by, timestamps or internal relations', async () => {
    const households = new InMemoryHouseholdRepository();
    seedHousehold(households, {
      id: randomUUID(),
      name: 'Casa Sousa',
      createdBy: AUTHENTICATED_USER_ID,
      createdAt: new Date('2026-09-13T15:00:00.000Z'),
      membershipUserId: AUTHENTICATED_USER_ID,
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get('/api/households')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toEqual({
      id: expect.any(String),
      name: 'Casa Sousa',
      currencyCode: 'BRL',
      role: 'owner',
      createdAt: '2026-09-13T15:00:00.000Z',
    });
    for (const forbiddenField of [
      'createdBy',
      'created_by',
      'updatedAt',
      'updated_at',
      'members',
      'categories',
      'transactions',
      'createdByEmail',
    ]) {
      expect(response.body.data[0]).not.toHaveProperty(forbiddenField);
    }
  });

  it('returns 401 without an access token', async () => {
    const app = createTestApp(new InMemoryHouseholdRepository());

    const response = await request(app).get('/api/households');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  });

  it('returns 401 for an invalid access token', async () => {
    const app = createTestApp(new InMemoryHouseholdRepository());

    const response = await request(app)
      .get('/api/households')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('does not let query or body parameters override the authenticated identity', async () => {
    const households = new InMemoryHouseholdRepository();
    seedHousehold(households, {
      id: randomUUID(),
      name: 'Casa Sousa',
      createdBy: OTHER_USER_ID,
      createdAt: new Date('2026-09-13T15:00:00.000Z'),
      membershipUserId: OTHER_USER_ID,
    });
    seedHousehold(households, {
      id: randomUUID(),
      name: 'Casa Haru',
      createdBy: AUTHENTICATED_USER_ID,
      createdAt: new Date('2026-09-12T15:00:00.000Z'),
      membershipUserId: AUTHENTICATED_USER_ID,
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get(`/api/households?userId=${OTHER_USER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: OTHER_USER_ID });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ name: 'Casa Haru' });
  });

  it('returns a sanitized 500 when the repository fails', async () => {
    const households = new InMemoryHouseholdRepository(
      AUTHENTICATED_USER_ID,
      undefined,
      new Error('listing database details'),
    );
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get('/api/households')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('listing database details');
  });

  it('orders households deterministically by createdAt DESC and id DESC', async () => {
    const households = new InMemoryHouseholdRepository();
    seedHousehold(households, {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Casa Um',
      createdBy: AUTHENTICATED_USER_ID,
      createdAt: new Date('2026-09-13T15:00:00.000Z'),
      membershipUserId: AUTHENTICATED_USER_ID,
    });
    seedHousehold(households, {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Casa Dois',
      createdBy: AUTHENTICATED_USER_ID,
      createdAt: new Date('2026-09-13T15:00:00.000Z'),
      membershipUserId: AUTHENTICATED_USER_ID,
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get('/api/households')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.map((household: { id: string }) => household.id)).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
    ]);
  });
});

describe('GET /api/households/:householdId/members', () => {
  const HOUSEHOLD_ID = randomUUID();
  const OTHER_HOUSEHOLD_ID = randomUUID();

  function addMembership(
    households: InMemoryHouseholdRepository,
    membership: StoredMembership,
  ): void {
    households.memberships.push(membership);
  }

  it('allows an owner to list public owner and member data in deterministic order', async () => {
    const households = new InMemoryHouseholdRepository();
    addMembership(households, {
      householdId: HOUSEHOLD_ID,
      userId: OTHER_USER_ID,
      name: 'Outro Usuario',
      email: 'outro@example.com',
      passwordHash: 'must-not-leak',
      role: 'member',
      joinedAt: new Date('2026-09-12T10:00:00.000Z'),
    });
    addMembership(households, {
      householdId: HOUSEHOLD_ID,
      userId: AUTHENTICATED_USER_ID,
      name: 'Harry Sousa',
      email: 'harry@example.com',
      passwordHash: 'must-not-leak',
      role: 'owner',
      joinedAt: new Date('2026-09-13T10:00:00.000Z'),
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [
        {
          userId: AUTHENTICATED_USER_ID,
          name: 'Harry Sousa',
          email: 'harry@example.com',
          role: 'owner',
          joinedAt: '2026-09-13T10:00:00.000Z',
        },
        {
          userId: OTHER_USER_ID,
          name: 'Outro Usuario',
          email: 'outro@example.com',
          role: 'member',
          joinedAt: '2026-09-12T10:00:00.000Z',
        },
      ],
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('must-not-leak');
    expect(response.body.data[0]).not.toHaveProperty('household');
    expect(response.body.data[0]).not.toHaveProperty('createdBy');
  });

  it('allows a member to list all members', async () => {
    const households = new InMemoryHouseholdRepository();
    addMembership(households, {
      householdId: HOUSEHOLD_ID,
      userId: OTHER_USER_ID,
      name: 'Owner',
      email: 'owner@example.com',
      role: 'owner',
    });
    addMembership(households, {
      householdId: HOUSEHOLD_ID,
      userId: AUTHENTICATED_USER_ID,
      name: 'Member',
      email: 'member@example.com',
      role: 'member',
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((member: { role: string }) => member.role)).toEqual([
      'owner',
      'member',
    ]);
  });

  it('orders members with equal roles and joinedAt by userId ASC', async () => {
    const households = new InMemoryHouseholdRepository();
    const joinedAt = new Date('2026-09-13T10:00:00.000Z');
    const firstUserId = '00000000-0000-4000-8000-000000000001';
    const secondUserId = '00000000-0000-4000-8000-000000000002';
    addMembership(households, {
      householdId: HOUSEHOLD_ID,
      userId: AUTHENTICATED_USER_ID,
      role: 'owner',
      joinedAt,
    });
    addMembership(households, {
      householdId: HOUSEHOLD_ID,
      userId: secondUserId,
      role: 'member',
      joinedAt,
    });
    addMembership(households, {
      householdId: HOUSEHOLD_ID,
      userId: firstUserId,
      role: 'member',
      joinedAt,
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.slice(1).map((member: { userId: string }) => member.userId)).toEqual([
      firstUserId,
      secondUserId,
    ]);
  });

  it('returns 403 when the authenticated user has no membership', async () => {
    const households = new InMemoryHouseholdRepository();
    addMembership(households, {
      householdId: HOUSEHOLD_ID,
      userId: OTHER_USER_ID,
      role: 'owner',
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
  });

  it('does not grant access from created_by without membership', async () => {
    const households = new InMemoryHouseholdRepository();
    households.households.push({
      id: HOUSEHOLD_ID,
      name: 'Casa sem membership',
      currencyCode: 'BRL',
      createdBy: AUTHENTICATED_USER_ID,
      createdAt: new Date(),
    });
    addMembership(households, {
      householdId: HOUSEHOLD_ID,
      userId: OTHER_USER_ID,
      role: 'member',
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('returns the same 403 for a nonexistent household', async () => {
    const app = createTestApp(new InMemoryHouseholdRepository());
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get(`/api/households/${randomUUID()}/members`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
  });

  it('returns 400 for an invalid householdId', async () => {
    const app = createTestApp(new InMemoryHouseholdRepository());
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get('/api/households/not-a-uuid/members')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request parameter' },
    });
  });

  it('returns 401 without an access token', async () => {
    const app = createTestApp(new InMemoryHouseholdRepository());

    const response = await request(app).get(`/api/households/${HOUSEHOLD_ID}/members`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for an invalid access token', async () => {
    const app = createTestApp(new InMemoryHouseholdRepository());

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('does not allow query or body identity overrides', async () => {
    const households = new InMemoryHouseholdRepository();
    addMembership(households, {
      householdId: HOUSEHOLD_ID,
      userId: OTHER_USER_ID,
      role: 'owner',
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/members?userId=${OTHER_USER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: OTHER_USER_ID });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('returns a sanitized 500 when member listing fails', async () => {
    const households = new InMemoryHouseholdRepository(
      AUTHENTICATED_USER_ID,
      undefined,
      undefined,
      new Error('sensitive database details'),
    );
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive database details');
  });

  it('does not allow a member of household A to list household B', async () => {
    const households = new InMemoryHouseholdRepository();
    addMembership(households, {
      householdId: HOUSEHOLD_ID,
      userId: AUTHENTICATED_USER_ID,
      role: 'member',
    });
    addMembership(households, {
      householdId: OTHER_HOUSEHOLD_ID,
      userId: OTHER_USER_ID,
      role: 'owner',
    });
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .get(`/api/households/${OTHER_HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});

describe('TypeOrmHouseholdRepository', () => {
  it('runs household and owner creation in one transaction that rejects on membership failure', async () => {
    const creator = Object.assign(new UserEntity(), { id: AUTHENTICATED_USER_ID });
    let transactionCalls = 0;
    let saveCalls = 0;
    const manager = {
      async findOneBy(): Promise<UserEntity> {
        return creator;
      },
      create(
        entity: typeof HouseholdEntity | typeof HouseholdMemberEntity,
        data: object,
      ): HouseholdEntity | HouseholdMemberEntity {
        if (entity === HouseholdEntity) {
          return Object.assign(new HouseholdEntity(), data);
        }

        return Object.assign(new HouseholdMemberEntity(), data);
      },
      async save<T extends object>(entity: T): Promise<T> {
        saveCalls += 1;

        if (entity instanceof HouseholdMemberEntity) {
          throw new Error('membership failed');
        }

        return Object.assign(entity, {
          id: randomUUID(),
          createdAt: new Date(),
        });
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        transactionCalls += 1;
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmHouseholdRepository(dataSource);

    await expect(
      repository.createWithOwner({ name: 'Casa Sousa', creatorId: AUTHENTICATED_USER_ID }),
    ).rejects.toThrow('membership failed');
    expect(transactionCalls).toBe(1);
    expect(saveCalls).toBe(2);
  });

  it('lists member households with a single joined query', async () => {
    class FakeQueryBuilder {
      private queryCalls = 0;

      constructor(private readonly rows: HouseholdMemberEntity[]) {}

      innerJoinAndSelect(_path: string, _alias: string): FakeQueryBuilder {
        return this;
      }

      where(_condition: string, _params: Record<string, string>): FakeQueryBuilder {
        return this;
      }

      orderBy(_column: string, _direction: 'ASC' | 'DESC'): FakeQueryBuilder {
        return this;
      }

      addOrderBy(_column: string, _direction: 'ASC' | 'DESC'): FakeQueryBuilder {
        return this;
      }

      async getMany(): Promise<HouseholdMemberEntity[]> {
        this.queryCalls += 1;
        return this.rows;
      }

      get count(): number {
        return this.queryCalls;
      }
    }

    const expectedHousehold = {
      id: randomUUID(),
      name: 'Casa Sousa',
      currencyCode: 'BRL',
      createdAt: new Date('2026-09-13T15:00:00.000Z'),
    };
    const builder = new FakeQueryBuilder([
      Object.assign(new HouseholdMemberEntity(), {
        id: randomUUID(),
        role: 'owner',
        joinedAt: new Date(),
        household: Object.assign(new HouseholdEntity(), {
          ...expectedHousehold,
          updatedAt: new Date(),
        }),
        user: Object.assign(new UserEntity(), { id: AUTHENTICATED_USER_ID }),
      }),
    ]);
    const dataSource = {
      getRepository(_entity: unknown): {
        createQueryBuilder(_alias: string): FakeQueryBuilder;
      } {
        return {
          createQueryBuilder: () => builder,
        };
      },
    } as unknown as DataSource;
    const repository = new TypeOrmHouseholdRepository(dataSource);

    const result = await repository.listForMember(AUTHENTICATED_USER_ID);

    expect(builder.count).toBe(1);
    expect(result).toEqual([
      {
        id: expectedHousehold.id,
        name: expectedHousehold.name,
        currencyCode: expectedHousehold.currencyCode,
        role: 'owner',
        createdAt: expectedHousehold.createdAt,
      },
    ]);
  });

  it('authorizes and lists members in one joined query without selecting password hashes', async () => {
    class FakeMemberQueryBuilder {
      readonly joins: unknown[][] = [];
      readonly selections: string[] = [];
      readonly conditions: Array<{ sql: string; parameters: Record<string, string> }> = [];
      readonly orderings: Array<{ expression: string; direction: 'ASC' | 'DESC' }> = [];
      private queryCalls = 0;

      innerJoin(...args: unknown[]): FakeMemberQueryBuilder {
        this.joins.push(args);
        return this;
      }

      select(selection: string, _alias: string): FakeMemberQueryBuilder {
        this.selections.push(selection);
        return this;
      }

      addSelect(selection: string, _alias: string): FakeMemberQueryBuilder {
        this.selections.push(selection);
        return this;
      }

      where(condition: string, parameters: Record<string, string>): FakeMemberQueryBuilder {
        this.conditions.push({ sql: condition, parameters });
        return this;
      }

      orderBy(expression: string, direction: 'ASC' | 'DESC'): FakeMemberQueryBuilder {
        this.orderings.push({ expression, direction });
        return this;
      }

      addOrderBy(expression: string, direction: 'ASC' | 'DESC'): FakeMemberQueryBuilder {
        this.orderings.push({ expression, direction });
        return this;
      }

      async getRawMany(): Promise<
        Array<{
          userId: string;
          name: string;
          email: string;
          role: 'owner' | 'member';
          joinedAt: Date;
        }>
      > {
        this.queryCalls += 1;
        return [
          {
            userId: AUTHENTICATED_USER_ID,
            name: 'Harry Sousa',
            email: 'harry@example.com',
            role: 'owner',
            joinedAt: new Date('2026-09-13T10:00:00.000Z'),
          },
        ];
      }

      get count(): number {
        return this.queryCalls;
      }
    }

    const builder = new FakeMemberQueryBuilder();
    const dataSource = {
      getRepository(_entity: unknown): {
        createQueryBuilder(_alias: string): FakeMemberQueryBuilder;
      } {
        return { createQueryBuilder: () => builder };
      },
    } as unknown as DataSource;
    const repository = new TypeOrmHouseholdRepository(dataSource);

    const householdId = randomUUID();
    const result = await repository.listMembersForMember(householdId, AUTHENTICATED_USER_ID);

    expect(builder.count).toBe(1);
    expect(builder.joins).toHaveLength(2);
    expect(JSON.stringify(builder.joins)).toContain('viewer.user_id');
    expect(JSON.stringify(builder.joins)).toContain(AUTHENTICATED_USER_ID);
    expect(builder.conditions).toEqual([
      {
        sql: 'member.household_id = :householdId',
        parameters: { householdId },
      },
    ]);
    expect(builder.orderings).toEqual([
      {
        expression: "CASE WHEN member.role = 'owner' THEN 0 ELSE 1 END",
        direction: 'ASC',
      },
      { expression: 'member.joined_at', direction: 'ASC' },
      { expression: 'user.id', direction: 'ASC' },
    ]);
    expect(builder.selections).toEqual([
      'user.id',
      'user.name',
      'user.email',
      'member.role',
      'member.joined_at',
    ]);
    expect(builder.selections).not.toContain('user.password_hash');
    expect(result).toEqual([
      {
        userId: AUTHENTICATED_USER_ID,
        name: 'Harry Sousa',
        email: 'harry@example.com',
        role: 'owner',
        joinedAt: new Date('2026-09-13T10:00:00.000Z'),
      },
    ]);
  });
});
