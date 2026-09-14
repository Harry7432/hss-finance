import { randomUUID } from 'node:crypto';

import { SignJWT } from 'jose';
import request from 'supertest';
import { QueryFailedError, type DataSource, type EntityManager, type Repository } from 'typeorm';

import { createApp } from '../src/app.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';
import { CategoryEntity } from '../src/database/entities/category.entity.js';
import { HouseholdMemberEntity } from '../src/database/entities/household-member.entity.js';
import { CategoryAlreadyExistsError } from '../src/errors/category-already-exists-error.js';
import { CategoryInUseError } from '../src/errors/category-in-use-error.js';
import { CategoryNotFoundError } from '../src/errors/category-not-found-error.js';
import { ForbiddenError } from '../src/errors/forbidden-error.js';
import type {
  CategoryRecord,
  CategoryRepository,
  CategoryType,
  CreateCategoryData,
  UpdateCategoryData,
} from '../src/repositories/category-repository.js';
import { TypeOrmCategoryRepository } from '../src/repositories/category-repository.js';
import type {
  AddedHouseholdMember,
  CreatedHousehold,
  CreateHouseholdData,
  HouseholdRepository,
  ListedHousehold,
  ListedHouseholdMember,
} from '../src/repositories/household-repository.js';
import type { CreateUserData, UserRepository } from '../src/repositories/user-repository.js';
import type { UserEntity } from '../src/database/entities/user.entity.js';

const TEST_JWT_SECRET = Buffer.alloc(32, 2);
const USER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();
const HOUSEHOLD_ID = randomUUID();
const OTHER_HOUSEHOLD_ID = randomUUID();
const NOW = new Date('2026-09-13T15:00:00.000Z');
const UPDATED_AT = new Date('2026-09-13T16:00:00.000Z');

const database: DatabaseReadiness = {
  async isReady(): Promise<boolean> {
    return true;
  },
};

class StubUserRepository implements UserRepository {
  async create(_data: CreateUserData): Promise<UserEntity> {
    throw new Error('Not implemented in category tests.');
  }

  async findByEmail(_email: string): Promise<UserEntity | null> {
    return null;
  }

  async findById(_id: string): Promise<UserEntity | null> {
    return null;
  }
}

class InMemoryHouseholdRepository implements HouseholdRepository {
  readonly memberships: Array<{
    householdId: string;
    userId: string;
    role: 'owner' | 'member';
  }> = [];
  readonly createdBy = new Map<string, string>();
  readonly membershipChecks: Array<{ householdId: string; userId: string }> = [];

  async createWithOwner(_data: CreateHouseholdData): Promise<CreatedHousehold | null> {
    throw new Error('Not implemented in category tests.');
  }

  async listForMember(_userId: string): Promise<ListedHousehold[]> {
    throw new Error('Not implemented in category tests.');
  }

  async listMembersForMember(
    _householdId: string,
    _userId: string,
  ): Promise<ListedHouseholdMember[] | null> {
    throw new Error('Not implemented in category tests.');
  }

  async findMembershipRole(
    householdId: string,
    userId: string,
  ): Promise<'owner' | 'member' | null> {
    this.membershipChecks.push({ householdId, userId });
    return (
      this.memberships.find(
        (membership) => membership.householdId === householdId && membership.userId === userId,
      )?.role ?? null
    );
  }

  async addMemberAsOwner(
    _householdId: string,
    _requesterId: string,
    _userId: string,
  ): Promise<AddedHouseholdMember> {
    throw new Error('Not implemented in category tests.');
  }
}

interface StoredCategory extends CategoryRecord {
  householdId: string;
}

class InMemoryCategoryRepository implements CategoryRepository {
  readonly records: StoredCategory[] = [];
  readonly usedCategoryIds = new Set<string>();

  constructor(
    private readonly households: InMemoryHouseholdRepository,
    private readonly errors: {
      create?: Error;
      list?: Error;
      update?: Error;
      delete?: Error;
    } = {},
  ) {}

  async create(data: CreateCategoryData): Promise<CategoryRecord> {
    if (this.errors.create) {
      throw this.errors.create;
    }

    if (
      this.records.some(
        (category) =>
          category.householdId === data.householdId &&
          category.type === data.type &&
          category.name === data.name,
      )
    ) {
      throw new CategoryAlreadyExistsError();
    }

    const category: StoredCategory = {
      id: randomUUID(),
      householdId: data.householdId,
      name: data.name,
      type: data.type,
      color: data.color,
      icon: data.icon,
      isDefault: false,
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.records.push(category);
    return category;
  }

  async list(householdId: string, type?: CategoryType): Promise<CategoryRecord[]> {
    if (this.errors.list) {
      throw this.errors.list;
    }

    return this.records
      .filter(
        (category) => category.householdId === householdId && (!type || category.type === type),
      )
      .sort(
        (left, right) =>
          left.type.localeCompare(right.type) ||
          left.name.localeCompare(right.name) ||
          left.id.localeCompare(right.id),
      );
  }

  async update(
    householdId: string,
    categoryId: string,
    data: UpdateCategoryData,
  ): Promise<CategoryRecord | null> {
    if (this.errors.update) {
      throw this.errors.update;
    }

    const category = this.records.find(
      (record) => record.id === categoryId && record.householdId === householdId,
    );

    if (!category) {
      return null;
    }

    const name = data.name ?? category.name;

    if (
      this.records.some(
        (record) =>
          record.id !== category.id &&
          record.householdId === householdId &&
          record.type === category.type &&
          record.name === name,
      )
    ) {
      throw new CategoryAlreadyExistsError();
    }

    category.name = name;
    if (data.color !== undefined) category.color = data.color;
    if (data.icon !== undefined) category.icon = data.icon;
    category.updatedAt = UPDATED_AT;
    return category;
  }

  async deleteAsOwner(householdId: string, requesterId: string, categoryId: string): Promise<void> {
    if (this.errors.delete) {
      throw this.errors.delete;
    }

    const role = await this.households.findMembershipRole(householdId, requesterId);

    if (role !== 'owner') {
      throw new ForbiddenError();
    }

    const index = this.records.findIndex(
      (record) => record.id === categoryId && record.householdId === householdId,
    );

    if (index < 0) {
      throw new CategoryNotFoundError();
    }

    if (this.usedCategoryIds.has(categoryId)) {
      throw new CategoryInUseError();
    }

    this.records.splice(index, 1);
  }
}

function grantRole(
  households: InMemoryHouseholdRepository,
  householdId: string,
  userId: string,
  role: 'owner' | 'member',
): void {
  households.memberships.push({ householdId, userId, role });
}

function seedCategory(
  categories: InMemoryCategoryRepository,
  data: Partial<StoredCategory> = {},
): StoredCategory {
  const category: StoredCategory = {
    id: randomUUID(),
    householdId: HOUSEHOLD_ID,
    name: 'Alimentacao',
    type: 'expense',
    color: '#FFAA00',
    icon: 'utensils',
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...data,
  };
  categories.records.push(category);
  return category;
}

async function createToken(userId: string): Promise<string> {
  return new SignJWT({ email: 'member@example.com' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(TEST_JWT_SECRET);
}

function createTestContext(
  errors: ConstructorParameters<typeof InMemoryCategoryRepository>[1] = {},
) {
  const households = new InMemoryHouseholdRepository();
  const categories = new InMemoryCategoryRepository(households, errors);
  const app = createApp(
    database,
    new StubUserRepository(),
    TEST_JWT_SECRET,
    households,
    categories,
  );
  return { app, households, categories };
}

describe('POST /api/households/:householdId/categories', () => {
  it.each(['owner', 'member'] as const)(
    'allows a %s to create an expense category',
    async (role) => {
      const { app, households, categories } = createTestContext();
      grantRole(households, HOUSEHOLD_ID, USER_ID, role);
      const token = await createToken(USER_ID);

      const response = await request(app)
        .post(`/api/households/${HOUSEHOLD_ID}/categories`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: '  Alimentacao  ',
          type: 'expense',
          color: '#FFAA00',
          icon: 'utensils',
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        data: {
          id: expect.any(String),
          name: 'Alimentacao',
          type: 'expense',
          color: '#FFAA00',
          icon: 'utensils',
          isDefault: false,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        },
      });
      expect(categories.records[0]).toMatchObject({
        householdId: HOUSEHOLD_ID,
        name: 'Alimentacao',
        isDefault: false,
      });
      expect(response.body.data).not.toHaveProperty('household');
    },
  );

  it.each(['income', 'expense'] as const)('accepts the %s category type', async (type) => {
    const { app, households } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/categories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: type, type });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ type, color: null, icon: null, isDefault: false });
  });

  it.each([
    ['invalid color', { name: 'A', type: 'expense', color: '#FFF' }],
    ['invalid type', { name: 'A', type: 'transfer' }],
    ['unknown field', { name: 'A', type: 'expense', extra: true }],
    ['isDefault', { name: 'A', type: 'expense', isDefault: true }],
    ['householdId', { name: 'A', type: 'expense', householdId: OTHER_HOUSEHOLD_ID }],
    ['id', { name: 'A', type: 'expense', id: randomUUID() }],
    ['timestamp', { name: 'A', type: 'expense', createdAt: NOW.toISOString() }],
  ])('returns 400 for %s in the payload', async (_caseName, payload) => {
    const { app, households } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'owner');
    const token = await createToken(USER_ID);

    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/categories`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without a token', async () => {
    const { app } = createTestContext();
    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/categories`)
      .send({ name: 'A', type: 'expense' });
    expect(response.status).toBe(401);
  });

  it.each(['nonexistent household', 'no membership'])('returns 403 for %s', async () => {
    const { app } = createTestContext();
    const token = await createToken(USER_ID);
    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/categories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A', type: 'expense' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('does not grant permission from household created_by without membership', async () => {
    const { app, households } = createTestContext();
    households.createdBy.set(HOUSEHOLD_ID, USER_ID);
    const token = await createToken(USER_ID);
    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/categories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A', type: 'expense' });
    expect(response.status).toBe(403);
  });

  it('returns 409 for a duplicate category', async () => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    seedCategory(categories);
    const token = await createToken(USER_ID);
    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/categories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alimentacao', type: 'expense' });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'CATEGORY_ALREADY_EXISTS', message: 'Category already exists' },
    });
  });

  it('returns a sanitized 500 for an unexpected create error', async () => {
    const { app, households } = createTestContext({ create: new Error('database details') });
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    const token = await createToken(USER_ID);
    const response = await request(app)
      .post(`/api/households/${HOUSEHOLD_ID}/categories?userId=${OTHER_USER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A', type: 'expense' });
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('database details');
    expect(households.membershipChecks[0]?.userId).toBe(USER_ID);
  });
});

describe('GET /api/households/:householdId/categories', () => {
  it.each(['owner', 'member'] as const)('allows a %s to list categories', async (role) => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, role);
    seedCategory(categories);
    const token = await createToken(USER_ID);
    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/categories`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).not.toHaveProperty('householdId');
  });

  it('returns an empty list for an authorized household', async () => {
    const { app, households } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    const token = await createToken(USER_ID);
    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/categories`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: [] });
  });

  it.each(['income', 'expense'] as const)('filters categories by %s', async (type) => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    seedCategory(categories, { name: 'Receita', type: 'income' });
    seedCategory(categories, { name: 'Moradia', type: 'expense' });
    const token = await createToken(USER_ID);
    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/categories?type=${type}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].type).toBe(type);
  });

  it('returns 400 for an invalid filter', async () => {
    const { app, households } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    const token = await createToken(USER_ID);
    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/categories?type=transfer`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(400);
  });

  it('only returns categories from the household in the URL', async () => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    seedCategory(categories, { householdId: HOUSEHOLD_ID, name: 'Visible' });
    seedCategory(categories, { householdId: OTHER_HOUSEHOLD_ID, name: 'Hidden' });
    const token = await createToken(USER_ID);
    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/categories`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.body.data.map((category: { name: string }) => category.name)).toEqual([
      'Visible',
    ]);
  });

  it('does not allow a member of household A to list household B', async () => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    seedCategory(categories, { householdId: OTHER_HOUSEHOLD_ID });
    const token = await createToken(USER_ID);
    const response = await request(app)
      .get(`/api/households/${OTHER_HOUSEHOLD_ID}/categories`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it.each(['nonexistent household', 'no membership'])('returns 403 for %s', async () => {
    const { app } = createTestContext();
    const token = await createToken(USER_ID);
    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/categories`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it('orders by type ASC, name ASC and id ASC', async () => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    seedCategory(categories, { id: '00000000-0000-4000-8000-000000000002', name: 'B' });
    seedCategory(categories, { id: '00000000-0000-4000-8000-000000000003', name: 'A' });
    seedCategory(categories, {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'B',
      type: 'income',
    });
    const token = await createToken(USER_ID);
    const response = await request(app)
      .get(`/api/households/${HOUSEHOLD_ID}/categories`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.body.data.map((category: { id: string }) => category.id)).toEqual([
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
    ]);
  });
});

describe('PATCH /api/households/:householdId/categories/:categoryId', () => {
  it.each(['owner', 'member'] as const)('allows a %s to rename a category', async (role) => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, role);
    const category = seedCategory(categories);
    const token = await createToken(USER_ID);
    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '  Mercado  ' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ name: 'Mercado', type: 'expense' });
  });

  it.each([
    ['color', { color: '#00AAFF' }, { color: '#00AAFF' }],
    ['nullable color', { color: null }, { color: null }],
    ['icon', { icon: 'cart' }, { icon: 'cart' }],
    ['nullable icon', { icon: null }, { icon: null }],
  ])('updates %s', async (_caseName, payload, expected) => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    const category = seedCategory(categories);
    const token = await createToken(USER_ID);
    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject(expected);
  });

  it.each([
    ['empty patch', {}],
    ['immutable type', { type: 'income' }],
    ['isDefault', { isDefault: true }],
    ['householdId', { householdId: OTHER_HOUSEHOLD_ID }],
    ['invalid color', { color: 'FFAA00' }],
  ])('returns 400 for %s', async (_caseName, payload) => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    const category = seedCategory(categories);
    const token = await createToken(USER_ID);
    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(response.status).toBe(400);
  });

  it('returns 404 for a nonexistent category after membership validation', async () => {
    const { app, households } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    const token = await createToken(USER_ID);
    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/categories/${randomUUID()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: 'CATEGORY_NOT_FOUND', message: 'Category not found' },
    });
  });

  it('returns the same 404 for a category from another household', async () => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    const category = seedCategory(categories, { householdId: OTHER_HOUSEHOLD_ID });
    const token = await createToken(USER_ID);
    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect(category.name).toBe('Alimentacao');
  });

  it('does not allow a member of household A to update a category through household B', async () => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    const category = seedCategory(categories, { householdId: OTHER_HOUSEHOLD_ID });
    const token = await createToken(USER_ID);
    const response = await request(app)
      .patch(`/api/households/${OTHER_HOUSEHOLD_ID}/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Hidden' });
    expect(response.status).toBe(403);
    expect(category.name).toBe('Alimentacao');
  });

  it('returns 409 when a rename duplicates household type and name', async () => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    const category = seedCategory(categories, { name: 'A' });
    seedCategory(categories, { name: 'B' });
    const token = await createToken(USER_ID);
    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'B' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CATEGORY_ALREADY_EXISTS');
  });

  it('does not use query or body values to override requester identity', async () => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    grantRole(households, HOUSEHOLD_ID, OTHER_USER_ID, 'owner');
    const category = seedCategory(categories);
    const token = await createToken(USER_ID);
    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/categories/${category.id}?userId=${OTHER_USER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A' });
    expect(response.status).toBe(200);
    expect(households.membershipChecks[0]?.userId).toBe(USER_ID);
  });

  it('returns a sanitized 500 for an unexpected update error', async () => {
    const { app, households, categories } = createTestContext({
      update: new Error('update database details'),
    });
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    const category = seedCategory(categories);
    const token = await createToken(USER_ID);
    const response = await request(app)
      .patch(`/api/households/${HOUSEHOLD_ID}/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A' });
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('update database details');
  });
});

describe('DELETE /api/households/:householdId/categories/:categoryId', () => {
  it('allows an owner to delete a category', async () => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'owner');
    const category = seedCategory(categories);
    const token = await createToken(USER_ID);
    const response = await request(app)
      .delete(`/api/households/${HOUSEHOLD_ID}/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(categories.records).toHaveLength(0);
  });

  it.each(['member', 'no membership'] as const)('returns 403 for %s', async (scenario) => {
    const { app, households, categories } = createTestContext();
    if (scenario === 'member') grantRole(households, HOUSEHOLD_ID, USER_ID, 'member');
    const category = seedCategory(categories);
    const token = await createToken(USER_ID);
    const response = await request(app)
      .delete(`/api/households/${HOUSEHOLD_ID}/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(categories.records).toHaveLength(1);
  });

  it('does not let an owner of household A delete from household B', async () => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'owner');
    grantRole(households, OTHER_HOUSEHOLD_ID, OTHER_USER_ID, 'owner');
    const category = seedCategory(categories, { householdId: OTHER_HOUSEHOLD_ID });
    const token = await createToken(USER_ID);
    const response = await request(app)
      .delete(`/api/households/${OTHER_HOUSEHOLD_ID}/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(categories.records).toHaveLength(1);
  });

  it.each(['nonexistent', 'other household'] as const)(
    'returns 404 for a %s category after URL household authorization',
    async (scenario) => {
      const { app, households, categories } = createTestContext();
      grantRole(households, HOUSEHOLD_ID, USER_ID, 'owner');
      const category = seedCategory(categories, {
        householdId: scenario === 'other household' ? OTHER_HOUSEHOLD_ID : HOUSEHOLD_ID,
      });
      const categoryId = scenario === 'nonexistent' ? randomUUID() : category.id;
      const token = await createToken(USER_ID);
      const response = await request(app)
        .delete(`/api/households/${HOUSEHOLD_ID}/categories/${categoryId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('CATEGORY_NOT_FOUND');
    },
  );

  it('returns 409 when the category is used by a transaction', async () => {
    const { app, households, categories } = createTestContext();
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'owner');
    const category = seedCategory(categories);
    categories.usedCategoryIds.add(category.id);
    const token = await createToken(USER_ID);
    const response = await request(app)
      .delete(`/api/households/${HOUSEHOLD_ID}/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'CATEGORY_IN_USE', message: 'Category is in use' },
    });
  });

  it('returns a sanitized 500 for an unexpected delete error', async () => {
    const { app, households, categories } = createTestContext({
      delete: new Error('delete database details'),
    });
    grantRole(households, HOUSEHOLD_ID, USER_ID, 'owner');
    const category = seedCategory(categories);
    const token = await createToken(USER_ID);
    const response = await request(app)
      .delete(`/api/households/${HOUSEHOLD_ID}/categories/${category.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('delete database details');
  });
});

describe('category route authentication', () => {
  it.each([
    ['GET', 'get', `/api/households/${HOUSEHOLD_ID}/categories`],
    ['PATCH', 'patch', `/api/households/${HOUSEHOLD_ID}/categories/${randomUUID()}`],
    ['DELETE', 'delete', `/api/households/${HOUSEHOLD_ID}/categories/${randomUUID()}`],
  ] as const)('returns 401 for %s without a token', async (_caseName, method, url) => {
    const { app } = createTestContext();
    const call = request(app)[method](url);
    const response = method === 'patch' ? await call.send({ name: 'A' }) : await call;
    expect(response.status).toBe(401);
  });
});

describe('category route parameter validation', () => {
  it.each([
    ['POST household', 'post', '/api/households/not-a-uuid/categories'],
    ['GET household', 'get', '/api/households/not-a-uuid/categories'],
    ['PATCH category', 'patch', `/api/households/${HOUSEHOLD_ID}/categories/not-a-uuid`],
    ['DELETE category', 'delete', `/api/households/${HOUSEHOLD_ID}/categories/not-a-uuid`],
  ] as const)('returns 400 for invalid %s UUID', async (_caseName, method, url) => {
    const { app } = createTestContext();
    const token = await createToken(USER_ID);
    const call = request(app)[method](url).set('Authorization', `Bearer ${token}`);
    const response =
      method === 'post' ? await call.send({ name: 'A', type: 'expense' }) : await call;
    expect(response.status).toBe(400);
  });
});

function constraintError(code: string, constraint: string): QueryFailedError {
  const driverError = Object.assign(new Error('database constraint details'), {
    code,
    constraint,
  });
  return new QueryFailedError('database query', [], driverError);
}

function persistedCategory(data: Partial<CategoryEntity> = {}): CategoryEntity {
  return Object.assign(new CategoryEntity(), {
    id: randomUUID(),
    name: 'Alimentacao',
    type: 'expense',
    color: null,
    icon: null,
    isDefault: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...data,
  });
}

describe('TypeOrmCategoryRepository constraint handling', () => {
  it.each([
    ['create', 'uq_categories_household_type_name', true],
    ['create', 'uq_other_constraint', false],
    ['update', 'uq_categories_household_type_name', true],
    ['update', 'uq_other_constraint', false],
  ] as const)('maps only the expected UNIQUE on %s (%s)', async (operation, constraint, maps) => {
    const error = constraintError('23505', constraint);
    const category = persistedCategory();
    const typeOrmRepository = {
      create(): CategoryEntity {
        return category;
      },
      async findOne(): Promise<CategoryEntity> {
        return category;
      },
      async save(): Promise<CategoryEntity> {
        throw error;
      },
    } as unknown as Repository<CategoryEntity>;
    const dataSource = {
      getRepository(): Repository<CategoryEntity> {
        return typeOrmRepository;
      },
    } as unknown as DataSource;
    const repository = new TypeOrmCategoryRepository(dataSource);
    const result =
      operation === 'create'
        ? repository.create({
            householdId: HOUSEHOLD_ID,
            name: 'Alimentacao',
            type: 'expense',
            color: null,
            icon: null,
          })
        : repository.update(HOUSEHOLD_ID, category.id, { name: 'Mercado' });

    if (maps) {
      await expect(result).rejects.toBeInstanceOf(CategoryAlreadyExistsError);
    } else {
      await expect(result).rejects.toBe(error);
    }
  });

  it.each([
    ['fk_transactions_category', true],
    ['fk_recurring_transactions_category', true],
    ['fk_other_constraint', false],
  ] as const)('maps only the expected delete FK (%s)', async (constraint, maps) => {
    const error = constraintError('23503', constraint);
    const membership = Object.assign(new HouseholdMemberEntity(), {
      id: randomUUID(),
      role: 'owner',
    });
    const category = persistedCategory();
    const manager = {
      async findOne(entity: unknown): Promise<HouseholdMemberEntity | CategoryEntity> {
        return entity === HouseholdMemberEntity ? membership : category;
      },
      async remove(): Promise<never> {
        throw error;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(operation: (entityManager: EntityManager) => Promise<T>): Promise<T> {
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmCategoryRepository(dataSource);
    const result = repository.deleteAsOwner(HOUSEHOLD_ID, USER_ID, category.id);

    if (maps) {
      await expect(result).rejects.toBeInstanceOf(CategoryInUseError);
    } else {
      await expect(result).rejects.toBe(error);
    }
  });

  it('revalidates owner with a membership row lock inside the delete transaction', async () => {
    let transactionCalls = 0;
    let removeCalls = 0;
    let membershipOptions: unknown;
    const manager = {
      async findOne(entity: unknown, options: unknown): Promise<HouseholdMemberEntity | null> {
        if (entity === HouseholdMemberEntity) {
          membershipOptions = options;
          return Object.assign(new HouseholdMemberEntity(), { id: randomUUID(), role: 'member' });
        }

        throw new Error('Category lookup must not run for a non-owner.');
      },
      async remove(): Promise<void> {
        removeCalls += 1;
      },
    } as unknown as EntityManager;
    const dataSource = {
      async transaction<T>(operation: (entityManager: EntityManager) => Promise<T>): Promise<T> {
        transactionCalls += 1;
        return operation(manager);
      },
    } as unknown as DataSource;
    const repository = new TypeOrmCategoryRepository(dataSource);

    await expect(
      repository.deleteAsOwner(HOUSEHOLD_ID, USER_ID, randomUUID()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transactionCalls).toBe(1);
    expect(removeCalls).toBe(0);
    expect(membershipOptions).toMatchObject({
      select: { id: true, role: true },
      where: {
        household: { id: HOUSEHOLD_ID },
        user: { id: USER_ID },
      },
      lock: { mode: 'pessimistic_read' },
    });
  });
});
