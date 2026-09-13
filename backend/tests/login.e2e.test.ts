import { randomUUID } from 'node:crypto';

import { argon2id, hash } from 'argon2';
import { jwtVerify } from 'jose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import { InvalidCredentialsError } from '../src/errors/invalid-credentials-error.js';
import type { CreateUserData, UserRepository } from '../src/repositories/user-repository.js';
import { LoginUserService } from '../src/services/login-user-service.js';

const TEST_JWT_SECRET = Buffer.alloc(32, 1);
const PASSWORD = 'senha-com-12-ou-mais';
const database: DatabaseReadiness = {
  async isReady(): Promise<boolean> {
    return true;
  },
};

class LoginUserRepository implements UserRepository {
  lastLookupEmail?: string;

  constructor(
    private readonly user: UserEntity | null,
    private readonly lookupError?: Error,
  ) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    this.lastLookupEmail = email;

    if (this.lookupError) {
      throw this.lookupError;
    }

    return this.user?.email === email ? this.user : null;
  }

  async create(_data: CreateUserData): Promise<UserEntity> {
    throw new Error('Not implemented in login tests.');
  }
}

function createUser(passwordHash: string): UserEntity {
  return Object.assign(new UserEntity(), {
    id: randomUUID(),
    name: 'Harry Sousa',
    email: 'harry@example.com',
    passwordHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('POST /api/auth/login', () => {
  let user: UserEntity;

  beforeAll(async () => {
    const passwordHash = await hash(PASSWORD, {
      type: argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    user = createUser(passwordHash);
  });

  it('returns public user data and a one-hour HS256 access token for valid credentials', async () => {
    const users = new LoginUserRepository(user);
    const app = createApp(database, users, TEST_JWT_SECRET);

    const response = await request(app).post('/api/auth/login').send({
      email: '  Harry@Example.COM  ',
      password: PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 3_600,
      },
    });
    expect(users.lastLookupEmail).toBe('harry@example.com');
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('password_hash');

    const { payload, protectedHeader } = await jwtVerify(
      response.body.data.accessToken,
      TEST_JWT_SECRET,
      { algorithms: ['HS256'] },
    );
    expect(protectedHeader.alg).toBe('HS256');
    expect(payload.sub).toBe(user.id);
    expect(payload.email).toBe(user.email);
    expect(payload.iat).toEqual(expect.any(Number));
    expect(payload.exp).toEqual(expect.any(Number));
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(3_600);
  });

  it('returns the same 401 response for a wrong password and an unknown email', async () => {
    const userApp = createApp(database, new LoginUserRepository(user), TEST_JWT_SECRET);
    const missingUserApp = createApp(database, new LoginUserRepository(null), TEST_JWT_SECRET);

    const wrongPasswordResponse = await request(userApp).post('/api/auth/login').send({
      email: user.email,
      password: 'senha-incorreta',
    });
    const unknownEmailResponse = await request(missingUserApp).post('/api/auth/login').send({
      email: 'missing@example.com',
      password: PASSWORD,
    });

    const expectedBody = {
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      },
    };
    expect(wrongPasswordResponse.status).toBe(401);
    expect(unknownEmailResponse.status).toBe(401);
    expect(wrongPasswordResponse.body).toEqual(expectedBody);
    expect(unknownEmailResponse.body).toEqual(expectedBody);
  });

  it('executes password verification against a reusable Argon2id dummy hash', async () => {
    const users = new LoginUserRepository(null);
    let verifiedHash: string | undefined;
    let verifiedPassword: string | undefined;
    const service = new LoginUserService(users, TEST_JWT_SECRET, async (passwordHash, password) => {
      verifiedHash = passwordHash;
      verifiedPassword = password;
      return false;
    });

    await expect(
      service.execute({ email: 'missing@example.com', password: PASSWORD }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(verifiedHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(verifiedPassword).toBe(PASSWORD);
  });

  it.each([
    ['an invalid email', { email: 'invalid-email', password: PASSWORD }],
    ['an unknown field', { email: 'harry@example.com', password: PASSWORD, role: 'admin' }],
    ['a missing required field', { email: 'harry@example.com' }],
  ])('returns 400 for %s', async (_caseName, payload) => {
    const app = createApp(database, new LoginUserRepository(user), TEST_JWT_SECRET);

    const response = await request(app).post('/api/auth/login').send(payload);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
      },
    });
  });

  it('returns a sanitized 500 response for an unexpected repository error', async () => {
    const users = new LoginUserRepository(null, new Error('database details'));
    const app = createApp(database, users, TEST_JWT_SECRET);

    const response = await request(app).post('/api/auth/login').send({
      email: 'harry@example.com',
      password: PASSWORD,
    });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('database details');
  });
});
