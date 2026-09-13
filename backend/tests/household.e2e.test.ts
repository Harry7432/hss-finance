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
  role: 'owner';
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
});
