import { randomUUID } from 'node:crypto';

import { verify } from 'argon2';
import request from 'supertest';
import { QueryFailedError, type Repository } from 'typeorm';

import { createApp } from '../src/app.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import type { CreateUserData, UserRepository } from '../src/repositories/user-repository.js';
import { TypeOrmUserRepository } from '../src/repositories/user-repository.js';

const database: DatabaseReadiness = {
  async isReady(): Promise<boolean> {
    return true;
  },
};

const validPayload = {
  name: 'Harry Sousa',
  email: 'harry@example.com',
  password: 'senha-com-12-ou-mais',
};

class InMemoryUserRepository implements UserRepository {
  readonly records: UserEntity[] = [];

  constructor(private readonly createError?: Error) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.records.find((user) => user.email === email) ?? null;
  }

  async create(data: CreateUserData): Promise<UserEntity> {
    if (this.createError) {
      throw this.createError;
    }

    const now = new Date('2026-09-13T15:00:00.000Z');
    const user = Object.assign(new UserEntity(), data, {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    this.records.push(user);
    return user;
  }
}

describe('POST /api/auth/register', () => {
  it('registers and persists a user with normalized public data and an Argon2id hash', async () => {
    const users = new InMemoryUserRepository();
    const app = createApp(database, users);

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        ...validPayload,
        name: '  Harry Sousa  ',
        email: '  Harry@Example.COM  ',
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        id: expect.any(String),
        name: 'Harry Sousa',
        email: 'harry@example.com',
        createdAt: '2026-09-13T15:00:00.000Z',
      },
    });
    expect(response.body.data).not.toHaveProperty('password');
    expect(response.body.data).not.toHaveProperty('passwordHash');
    expect(response.body.data).not.toHaveProperty('password_hash');

    expect(users.records).toHaveLength(1);
    const persistedUser = users.records[0];
    expect(persistedUser).toBeDefined();
    expect(persistedUser?.email).toBe('harry@example.com');
    expect(persistedUser?.name).toBe('Harry Sousa');
    expect(persistedUser?.passwordHash).not.toBe(validPayload.password);
    expect(persistedUser?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    await expect(verify(persistedUser?.passwordHash ?? '', validPayload.password)).resolves.toBe(
      true,
    );
  });

  it('returns 409 when the normalized email is already registered', async () => {
    const users = new InMemoryUserRepository();
    const app = createApp(database, users);

    await request(app).post('/api/auth/register').send(validPayload);
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        ...validPayload,
        email: ' HARRY@EXAMPLE.COM ',
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email already registered',
      },
    });
    expect(users.records).toHaveLength(1);
  });

  it('converts a PostgreSQL email UNIQUE constraint race into 409', async () => {
    const driverError = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'uq_users_email',
    });
    const queryError = new QueryFailedError('INSERT INTO users', [], driverError);
    const entity = Object.assign(new UserEntity(), {
      ...validPayload,
      passwordHash: 'not-persisted',
    });
    const typeOrmRepository = {
      create(): UserEntity {
        return entity;
      },
      async findOneBy(): Promise<UserEntity | null> {
        return null;
      },
      async save(): Promise<UserEntity> {
        throw queryError;
      },
    } as unknown as Repository<UserEntity>;
    const app = createApp(database, new TypeOrmUserRepository(typeOrmRepository));

    const response = await request(app).post('/api/auth/register').send(validPayload);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email already registered',
      },
    });
  });

  it('returns a generic 500 response for an unexpected persistence failure', async () => {
    const app = createApp(database, new InMemoryUserRepository(new Error('database details')));

    const response = await request(app).post('/api/auth/register').send(validPayload);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('database details');
  });

  it.each([
    ['an invalid email', { ...validPayload, email: 'invalid-email' }],
    ['a password shorter than 12 characters', { ...validPayload, password: 'short-pass' }],
    ['a password longer than 128 characters', { ...validPayload, password: 'a'.repeat(129) }],
    ['a blank name', { ...validPayload, name: '   ' }],
    ['an unknown field', { ...validPayload, role: 'admin' }],
    ['a missing required field', { name: validPayload.name, email: validPayload.email }],
  ])('returns 400 for %s', async (_caseName, payload) => {
    const users = new InMemoryUserRepository();
    const app = createApp(database, users);

    const response = await request(app).post('/api/auth/register').send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
      },
    });
    expect(users.records).toHaveLength(0);
  });
});
