import { randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';
import request from 'supertest';
import { QueryFailedError, type DataSource, type EntityManager, type Repository } from 'typeorm';

import { createApp } from '../src/app.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';
import { CategoryEntity } from '../src/database/entities/category.entity.js';
import { HouseholdMemberEntity } from '../src/database/entities/household-member.entity.js';
import { HouseholdEntity } from '../src/database/entities/household.entity.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import { AlreadyHouseholdMemberError } from '../src/errors/already-household-member-error.js';
import { ForbiddenError } from '../src/errors/forbidden-error.js';
import type {
  AddedHouseholdMember,
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
const EXPECTED_EXPENSE_CATEGORY_NAMES = [
  'Alimentação',
  'Moradia',
  'Transporte',
  'Saúde',
  'Educação',
  'Lazer',
  'Assinaturas',
  'Contas da casa',
  'Compras',
  'Outros',
];
const EXPECTED_INCOME_CATEGORY_NAMES = [
  'Salário',
  'Freelance',
  'Investimentos',
  'Benefícios',
  'Outros',
];
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

interface StoredCategory {
  householdId: string;
  name: string;
  type: 'income' | 'expense';
  color: null;
  icon: null;
  isDefault: true;
}

class StubUserRepository implements UserRepository {
  constructor(readonly records: UserEntity[] = []) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.records.find((user) => user.email === email) ?? null;
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
  readonly categories: StoredCategory[] = [];

  constructor(
    private readonly existingUserId: string | null = AUTHENTICATED_USER_ID,
    private readonly membershipError?: Error,
    private readonly listError?: Error,
    private readonly memberListError?: Error,
    private readonly addMemberError?: Error,
    private readonly categoryError?: Error,
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

    const defaultCategories: StoredCategory[] = [
      ...EXPECTED_EXPENSE_CATEGORY_NAMES.map((name) => ({
        householdId: household.id,
        name,
        type: 'expense' as const,
        color: null,
        icon: null,
        isDefault: true as const,
      })),
      ...EXPECTED_INCOME_CATEGORY_NAMES.map((name) => ({
        householdId: household.id,
        name,
        type: 'income' as const,
        color: null,
        icon: null,
        isDefault: true as const,
      })),
    ];

    if (this.categoryError) {
      throw this.categoryError;
    }

    this.households.push(household);
    this.memberships.push({
      householdId: household.id,
      userId: data.creatorId,
      role: 'owner',
    });
    this.categories.push(...defaultCategories);

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

  async findMembershipRole(
    householdId: string,
    userId: string,
  ): Promise<'owner' | 'member' | null> {
    return (
      this.memberships.find(
        (membership) => membership.householdId === householdId && membership.userId === userId,
      )?.role ?? null
    );
  }

  async addMemberAsOwner(
    householdId: string,
    requesterId: string,
    userId: string,
  ): Promise<AddedHouseholdMember> {
    if (this.addMemberError) {
      throw this.addMemberError;
    }

    const requesterRole = await this.findMembershipRole(householdId, requesterId);

    if (requesterRole !== 'owner') {
      throw new ForbiddenError();
    }

    if (
      this.memberships.some(
        (membership) => membership.householdId === householdId && membership.userId === userId,
      )
    ) {
      throw new AlreadyHouseholdMemberError();
    }

    const joinedAt = new Date('2026-09-13T16:00:00.000Z');
    this.memberships.push({ householdId, userId, role: 'member', joinedAt });

    return { role: 'member', joinedAt };
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

function createTestApp(
  households: HouseholdRepository,
  users: UserRepository = new StubUserRepository(),
) {
  return createApp(database, users, TEST_JWT_SECRET, households);
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
    expect(households.categories).toHaveLength(15);
    expect(households.categories.filter((category) => category.type === 'expense')).toHaveLength(
      10,
    );
    expect(households.categories.filter((category) => category.type === 'income')).toHaveLength(5);
    expect(
      households.categories
        .filter((category) => category.type === 'expense')
        .map((category) => category.name),
    ).toEqual(EXPECTED_EXPENSE_CATEGORY_NAMES);
    expect(
      households.categories
        .filter((category) => category.type === 'income')
        .map((category) => category.name),
    ).toEqual(EXPECTED_INCOME_CATEGORY_NAMES);
    expect(households.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Outros', type: 'expense' }),
        expect.objectContaining({ name: 'Outros', type: 'income' }),
      ]),
    );
    expect(households.categories.every((category) => category.isDefault)).toBe(true);
    expect(households.categories.every((category) => category.color === null)).toBe(true);
    expect(households.categories.every((category) => category.icon === null)).toBe(true);
    expect(
      households.categories.every((category) => category.householdId === response.body.data.id),
    ).toBe(true);
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
    expect(households.categories).toHaveLength(0);
  });

  it('rolls back household, owner and partial defaults when category creation fails', async () => {
    const households = new InMemoryHouseholdRepository(
      AUTHENTICATED_USER_ID,
      undefined,
      undefined,
      undefined,
      undefined,
      new Error('default category database details'),
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
    expect(JSON.stringify(response.body)).not.toContain('default category database details');
    expect(households.households).toHaveLength(0);
    expect(households.memberships).toHaveLength(0);
    expect(households.categories).toHaveLength(0);
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

describe('POST /api/households/:householdId/members', () => {
  const HOUSEHOLD_ID = randomUUID();
  const OTHER_HOUSEHOLD_ID = randomUUID();
  const TARGET_USER_ID = randomUUID();

  function createTargetUser(id: string = TARGET_USER_ID, email = 'membro@example.com'): UserEntity {
    return Object.assign(new UserEntity(), {
      id,
      name: id === AUTHENTICATED_USER_ID ? 'Harry Sousa' : 'Novo Membro',
      email,
      passwordHash: 'must-not-leak',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  function grantRole(
    households: InMemoryHouseholdRepository,
    householdId: string,
    userId: string,
    role: 'owner' | 'member',
  ): void {
    households.memberships.push({ householdId, userId, role });
  }

  it('allows an owner to add an existing user as member with normalized public data', async () => {
    const households = new InMemoryHouseholdRepository();
    grantRole(households, HOUSEHOLD_ID, AUTHENTICATED_USER_ID, 'owner');
    const users = new StubUserRepository([createTargetUser()]);
    const app = createTestApp(households, users);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: '  MEMBRO@EXAMPLE.COM  ' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        userId: TARGET_USER_ID,
        name: 'Novo Membro',
        email: 'membro@example.com',
        role: 'member',
        joinedAt: '2026-09-13T16:00:00.000Z',
      },
    });
    expect(households.memberships).toContainEqual({
      householdId: HOUSEHOLD_ID,
      userId: TARGET_USER_ID,
      role: 'member',
      joinedAt: new Date('2026-09-13T16:00:00.000Z'),
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('must-not-leak');
  });

  it('returns 403 when a member tries to add another user', async () => {
    const households = new InMemoryHouseholdRepository();
    grantRole(households, HOUSEHOLD_ID, AUTHENTICATED_USER_ID, 'member');
    const app = createTestApp(households, new StubUserRepository([createTargetUser()]));
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'membro@example.com' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
  });

  it('returns 403 when the requester has no membership', async () => {
    const app = createTestApp(
      new InMemoryHouseholdRepository(),
      new StubUserRepository([createTargetUser()]),
    );
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'membro@example.com' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('returns the same 403 for a nonexistent household', async () => {
    const app = createTestApp(
      new InMemoryHouseholdRepository(),
      new StubUserRepository([createTargetUser()]),
    );
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households/${randomUUID()}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'membro@example.com' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });
  });

  it('does not grant owner permission from created_by alone', async () => {
    const households = new InMemoryHouseholdRepository();
    households.households.push({
      id: HOUSEHOLD_ID,
      name: 'Casa Sousa',
      currencyCode: 'BRL',
      createdBy: AUTHENTICATED_USER_ID,
      createdAt: new Date(),
    });
    const app = createTestApp(households, new StubUserRepository([createTargetUser()]));
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'membro@example.com' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 when the target user is not registered', async () => {
    const households = new InMemoryHouseholdRepository();
    grantRole(households, HOUSEHOLD_ID, AUTHENTICATED_USER_ID, 'owner');
    const app = createTestApp(households);
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'missing@example.com' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'USER_NOT_FOUND', message: 'User not found' },
    });
  });

  it('returns 409 when the target user is already a household member', async () => {
    const households = new InMemoryHouseholdRepository();
    grantRole(households, HOUSEHOLD_ID, AUTHENTICATED_USER_ID, 'owner');
    grantRole(households, HOUSEHOLD_ID, TARGET_USER_ID, 'member');
    const app = createTestApp(households, new StubUserRepository([createTargetUser()]));
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'membro@example.com' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'ALREADY_HOUSEHOLD_MEMBER',
        message: 'User is already a household member',
      },
    });
  });

  it('returns 409 when an owner tries to add their own email', async () => {
    const households = new InMemoryHouseholdRepository();
    grantRole(households, HOUSEHOLD_ID, AUTHENTICATED_USER_ID, 'owner');
    const owner = createTargetUser(AUTHENTICATED_USER_ID, 'harry@example.com');
    const app = createTestApp(households, new StubUserRepository([owner]));
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'harry@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ALREADY_HOUSEHOLD_MEMBER');
  });

  it.each([
    ['an invalid email', HOUSEHOLD_ID, { email: 'invalid-email' }],
    ['an unknown field', HOUSEHOLD_ID, { email: 'membro@example.com', unknown: true }],
    ['a role field', HOUSEHOLD_ID, { email: 'membro@example.com', role: 'owner' }],
    ['a userId field', HOUSEHOLD_ID, { email: 'membro@example.com', userId: TARGET_USER_ID }],
    [
      'a householdId field',
      HOUSEHOLD_ID,
      { email: 'membro@example.com', householdId: randomUUID() },
    ],
  ])('returns 400 for %s', async (_caseName, householdId, payload) => {
    const households = new InMemoryHouseholdRepository();
    grantRole(households, HOUSEHOLD_ID, AUTHENTICATED_USER_ID, 'owner');
    const app = createTestApp(households, new StubUserRepository([createTargetUser()]));
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households/${householdId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for an invalid householdId', async () => {
    const app = createTestApp(new InMemoryHouseholdRepository());
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post('/api/households/not-a-uuid/members')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'membro@example.com' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without an access token', async () => {
    const app = createTestApp(new InMemoryHouseholdRepository());

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/members`)
      .send({ email: 'membro@example.com' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for an invalid access token', async () => {
    const app = createTestApp(new InMemoryHouseholdRepository());

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', 'Bearer invalid-token')
      .send({ email: 'membro@example.com' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('does not allow query parameters to override the requester identity', async () => {
    const households = new InMemoryHouseholdRepository();
    grantRole(households, HOUSEHOLD_ID, AUTHENTICATED_USER_ID, 'member');
    grantRole(households, HOUSEHOLD_ID, OTHER_USER_ID, 'owner');
    const app = createTestApp(households, new StubUserRepository([createTargetUser()]));
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/members?requesterId=${OTHER_USER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'membro@example.com' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(households.memberships).toHaveLength(2);
  });

  it('returns a sanitized 500 for an unexpected persistence error', async () => {
    const households = new InMemoryHouseholdRepository(
      AUTHENTICATED_USER_ID,
      undefined,
      undefined,
      undefined,
      new Error('sensitive persistence details'),
    );
    grantRole(households, HOUSEHOLD_ID, AUTHENTICATED_USER_ID, 'owner');
    const app = createTestApp(households, new StubUserRepository([createTargetUser()]));
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'membro@example.com' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(response.body)).not.toContain('sensitive persistence details');
  });

  it('does not allow an owner of household A to add members to household B', async () => {
    const households = new InMemoryHouseholdRepository();
    grantRole(households, HOUSEHOLD_ID, AUTHENTICATED_USER_ID, 'owner');
    grantRole(households, OTHER_HOUSEHOLD_ID, OTHER_USER_ID, 'owner');
    const app = createTestApp(households, new StubUserRepository([createTargetUser()]));
    const token = await createToken(AUTHENTICATED_USER_ID);

    const response = await request(app)
      .post(`/api/households/${OTHER_HOUSEHOLD_ID}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'membro@example.com' });

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

  it('creates household, owner and all default categories in one transaction with one batch save', async () => {
    const creator = Object.assign(new UserEntity(), { id: AUTHENTICATED_USER_ID });
    const saveInputs: unknown[] = [];
    let transactionCalls = 0;
    const manager = {
      async findOneBy(): Promise<UserEntity> {
        return creator;
      },
      create(entity: unknown, data: object | object[]): object | object[] {
        if (Array.isArray(data)) {
          return data.map((item) => Object.assign(new CategoryEntity(), item));
        }

        if (entity === HouseholdEntity) {
          return Object.assign(new HouseholdEntity(), data);
        }

        return Object.assign(new HouseholdMemberEntity(), data);
      },
      async save(entity: object | object[]): Promise<object | object[]> {
        saveInputs.push(entity);

        if (entity instanceof HouseholdEntity) {
          return Object.assign(entity, {
            id: randomUUID(),
            createdAt: new Date('2026-09-13T15:00:00.000Z'),
          });
        }

        return entity;
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

    const result = await repository.createWithOwner({
      name: 'Casa Sousa',
      creatorId: AUTHENTICATED_USER_ID,
    });

    expect(result).toMatchObject({ currencyCode: 'BRL', role: 'owner' });
    expect(transactionCalls).toBe(1);
    expect(saveInputs).toHaveLength(3);
    expect(saveInputs[0]).toBeInstanceOf(HouseholdEntity);
    expect(saveInputs[1]).toBeInstanceOf(HouseholdMemberEntity);
    expect(saveInputs[2]).toEqual(expect.any(Array));
    const categories = saveInputs[2] as CategoryEntity[];
    expect(categories).toHaveLength(15);
    expect(categories.filter((category) => category.type === 'expense')).toHaveLength(10);
    expect(categories.filter((category) => category.type === 'income')).toHaveLength(5);
    expect(categories.every((category) => category.isDefault)).toBe(true);
    expect(categories.every((category) => category.color === null)).toBe(true);
    expect(categories.every((category) => category.icon === null)).toBe(true);
  });

  it('rejects the same transaction when the default category batch save fails', async () => {
    const creator = Object.assign(new UserEntity(), { id: AUTHENTICATED_USER_ID });
    let transactionCalls = 0;
    let saveCalls = 0;
    const manager = {
      async findOneBy(): Promise<UserEntity> {
        return creator;
      },
      create(entity: unknown, data: object | object[]): object | object[] {
        if (Array.isArray(data)) {
          return data.map((item) => Object.assign(new CategoryEntity(), item));
        }

        if (entity === HouseholdEntity) {
          return Object.assign(new HouseholdEntity(), data);
        }

        return Object.assign(new HouseholdMemberEntity(), data);
      },
      async save(entity: object | object[]): Promise<object | object[]> {
        saveCalls += 1;

        if (Array.isArray(entity)) {
          throw new Error('default category batch failed');
        }

        if (entity instanceof HouseholdEntity) {
          return Object.assign(entity, { id: randomUUID(), createdAt: new Date() });
        }

        return entity;
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
    ).rejects.toThrow('default category batch failed');
    expect(transactionCalls).toBe(1);
    expect(saveCalls).toBe(3);
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

  it('converts the membership UNIQUE constraint race into AlreadyHouseholdMemberError', async () => {
    const driverError = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'uq_household_members_household_user',
    });
    const queryError = new QueryFailedError('INSERT INTO household_members', [], driverError);
    const membership = Object.assign(new HouseholdMemberEntity(), {
      role: 'member',
    });
    const typeOrmRepository = {
      async existsBy(): Promise<boolean> {
        return false;
      },
      create(): HouseholdMemberEntity {
        return membership;
      },
      async save(): Promise<HouseholdMemberEntity> {
        throw queryError;
      },
    } as unknown as Repository<HouseholdMemberEntity>;
    let authorizationOptions: unknown;
    const manager = {
      async findOne(_entity: unknown, options: unknown): Promise<HouseholdMemberEntity> {
        authorizationOptions = options;
        return Object.assign(new HouseholdMemberEntity(), { id: randomUUID(), role: 'owner' });
      },
      getRepository(): Repository<HouseholdMemberEntity> {
        return typeOrmRepository;
      },
    } as unknown as EntityManager;
    const transactionalDataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const transactionalRepository = new TypeOrmHouseholdRepository(transactionalDataSource);
    const householdId = randomUUID();
    const requesterId = randomUUID();

    await expect(
      transactionalRepository.addMemberAsOwner(householdId, requesterId, randomUUID()),
    ).rejects.toBeInstanceOf(AlreadyHouseholdMemberError);
    expect(authorizationOptions).toMatchObject({
      select: { id: true, role: true },
      where: {
        household: { id: householdId },
        user: { id: requesterId },
      },
      lock: { mode: 'pessimistic_read' },
    });
  });

  it('does not mask a different 23505 constraint as an existing membership', async () => {
    const driverError = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'uq_other_constraint',
    });
    const queryError = new QueryFailedError('INSERT INTO household_members', [], driverError);
    const typeOrmRepository = {
      async existsBy(): Promise<boolean> {
        return false;
      },
      create(): HouseholdMemberEntity {
        return Object.assign(new HouseholdMemberEntity(), { role: 'member' });
      },
      async save(): Promise<HouseholdMemberEntity> {
        throw queryError;
      },
    } as unknown as Repository<HouseholdMemberEntity>;
    const manager = {
      async findOne(): Promise<HouseholdMemberEntity> {
        return Object.assign(new HouseholdMemberEntity(), { id: randomUUID(), role: 'owner' });
      },
      getRepository(): Repository<HouseholdMemberEntity> {
        return typeOrmRepository;
      },
    } as unknown as EntityManager;
    const transactionalDataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const transactionalRepository = new TypeOrmHouseholdRepository(transactionalDataSource);

    await expect(
      transactionalRepository.addMemberAsOwner(randomUUID(), randomUUID(), randomUUID()),
    ).rejects.toBe(queryError);
  });

  it('rejects the insert when the requester is no longer owner at the transactional recheck', async () => {
    let repositoryRequested = false;
    const manager = {
      async findOne(): Promise<HouseholdMemberEntity> {
        return Object.assign(new HouseholdMemberEntity(), { id: randomUUID(), role: 'member' });
      },
      getRepository(): Repository<HouseholdMemberEntity> {
        repositoryRequested = true;
        throw new Error('The insert repository must not be requested.');
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(
        operation: (transactionManager: EntityManager) => Promise<T>,
      ): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmHouseholdRepository(dataSource);

    await expect(
      repository.addMemberAsOwner(randomUUID(), randomUUID(), randomUUID()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repositoryRequested).toBe(false);
  });
});
