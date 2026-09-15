import { randomUUID } from 'node:crypto';

import { argon2id, hash } from 'argon2';
import { SignJWT } from 'jose';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { SESSION_COOKIE_NAME } from '../src/config/session.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';
import { UserEntity } from '../src/database/entities/user.entity.js';
import type { CreateUserData, UserRepository } from '../src/repositories/user-repository.js';

const TEST_JWT_SECRET = Buffer.alloc(32, 1);
const OTHER_JWT_SECRET = Buffer.alloc(32, 2);
const PASSWORD = 'senha-com-12-ou-mais';
const UNAUTHORIZED_RESPONSE = {
  error: {
    code: 'UNAUTHORIZED',
    message: 'Authentication required',
  },
};
const database: DatabaseReadiness = {
  async isReady(): Promise<boolean> {
    return true;
  },
};

class MeUserRepository implements UserRepository {
  constructor(
    readonly users: UserEntity[],
    private readonly lookupError?: Error,
  ) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    if (this.lookupError) {
      throw this.lookupError;
    }

    return this.users.find((user) => user.id === id) ?? null;
  }

  async create(data: CreateUserData): Promise<UserEntity> {
    const now = new Date();
    const user = Object.assign(new UserEntity(), data, {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    this.users.push(user);
    return user;
  }
}

function createUser(email: string, passwordHash: string): UserEntity {
  return Object.assign(new UserEntity(), {
    id: randomUUID(),
    name: email === 'harry@example.com' ? 'Harry Sousa' : 'Other User',
    email,
    passwordHash,
    createdAt: new Date('2026-09-13T15:00:00.000Z'),
    updatedAt: new Date('2026-09-13T15:00:00.000Z'),
  });
}

async function createToken(options: {
  subject?: string;
  secret?: Uint8Array;
  algorithm?: 'HS256' | 'HS384';
  expirationTime?: string | number | null;
}): Promise<string> {
  const algorithm = options.algorithm ?? 'HS256';
  const token = new SignJWT({ email: 'harry@example.com' })
    .setProtectedHeader({ alg: algorithm, typ: 'JWT' })
    .setIssuedAt();

  if (options.expirationTime !== null) {
    token.setExpirationTime(options.expirationTime ?? '1h');
  }

  if (options.subject) {
    token.setSubject(options.subject);
  }

  return token.sign(options.secret ?? TEST_JWT_SECRET);
}

describe('GET /api/auth/me', () => {
  let user: UserEntity;

  beforeAll(async () => {
    const passwordHash = await hash(PASSWORD, {
      type: argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    user = createUser('harry@example.com', passwordHash);
  });

  it('returns the authenticated user public data for a valid token', async () => {
    const app = createApp(database, new MeUserRepository([user]), TEST_JWT_SECRET);
    const token = await createToken({ subject: user.id });

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toEqual({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('password_hash');
  });

  it('returns the authenticated user for a valid session cookie', async () => {
    const app = createApp(database, new MeUserRepository([user]), TEST_JWT_SECRET);
    const token = await createToken({ subject: user.id });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.data.id).toBe(user.id);
  });

  it('rejects an invalid session cookie without exposing its value', async () => {
    const app = createApp(database, new MeUserRepository([user]), TEST_JWT_SECRET);
    const invalidToken = 'invalid-cookie-token';

    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${invalidToken}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_RESPONSE);
    expect(JSON.stringify(response.body)).not.toContain(invalidToken);
    expect(JSON.stringify(response.body)).not.toContain(SESSION_COOKIE_NAME);
  });

  it('does not fall back to the cookie when an explicit Bearer token is invalid', async () => {
    const app = createApp(database, new MeUserRepository([user]), TEST_JWT_SECRET);
    const cookieToken = await createToken({ subject: user.id });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieToken}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_RESPONSE);
  });

  it('uses Bearer deterministically when Bearer and cookie identify different users', async () => {
    const otherUser = createUser('other@example.com', user.passwordHash);
    const app = createApp(database, new MeUserRepository([user, otherUser]), TEST_JWT_SECRET);
    const bearerToken = await createToken({ subject: otherUser.id });
    const cookieToken = await createToken({ subject: user.id });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${bearerToken}`)
      .set('Cookie', `${SESSION_COOKIE_NAME}=${cookieToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(otherUser.id);
  });

  it.each([
    ['a missing Authorization header', undefined],
    ['a non-Bearer scheme', 'Basic credentials'],
    ['Bearer without a token', 'Bearer'],
    ['a malformed JWT', 'Bearer not-a-jwt'],
  ])('returns the same 401 response for %s', async (_caseName, authorization) => {
    const app = createApp(database, new MeUserRepository([user]), TEST_JWT_SECRET);
    const pendingRequest = request(app).get('/api/auth/me');

    if (authorization) {
      pendingRequest.set('Authorization', authorization);
    }

    const response = await pendingRequest;

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_RESPONSE);
  });

  it('rejects a token with an invalid signature', async () => {
    const app = createApp(database, new MeUserRepository([user]), TEST_JWT_SECRET);
    const token = await createToken({ subject: user.id, secret: OTHER_JWT_SECRET });

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_RESPONSE);
  });

  it('rejects an expired token', async () => {
    const app = createApp(database, new MeUserRepository([user]), TEST_JWT_SECRET);
    const token = await createToken({ subject: user.id, expirationTime: 0 });

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_RESPONSE);
  });

  it('rejects a token signed with a different algorithm', async () => {
    const app = createApp(database, new MeUserRepository([user]), TEST_JWT_SECRET);
    const token = await createToken({ subject: user.id, algorithm: 'HS384' });

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_RESPONSE);
  });

  it('rejects a valid token without a subject', async () => {
    const app = createApp(database, new MeUserRepository([user]), TEST_JWT_SECRET);
    const token = await createToken({});

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_RESPONSE);
  });

  it('rejects a valid token without an expiration claim', async () => {
    const app = createApp(database, new MeUserRepository([user]), TEST_JWT_SECRET);
    const token = await createToken({ subject: user.id, expirationTime: null });

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_RESPONSE);
  });

  it('rejects a valid token whose subject is not a user UUID', async () => {
    const app = createApp(database, new MeUserRepository([user]), TEST_JWT_SECRET);
    const token = await createToken({ subject: 'not-a-uuid' });

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_RESPONSE);
  });

  it('returns 401 when the token user no longer exists', async () => {
    const app = createApp(database, new MeUserRepository([]), TEST_JWT_SECRET);
    const token = await createToken({ subject: user.id });

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHORIZED_RESPONSE);
  });

  it('uses only the token subject to select the authenticated user', async () => {
    const otherUser = createUser('other@example.com', user.passwordHash);
    const app = createApp(database, new MeUserRepository([user, otherUser]), TEST_JWT_SECRET);
    const token = await createToken({ subject: otherUser.id });

    const response = await request(app)
      .get(`/api/auth/me?userId=${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: user.id });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: otherUser.id,
      name: otherUser.name,
      email: otherUser.email,
      createdAt: otherUser.createdAt.toISOString(),
    });
  });

  it('returns a sanitized 500 response for an unexpected repository error', async () => {
    const users = new MeUserRepository([user], new Error('database details'));
    const app = createApp(database, users, TEST_JWT_SECRET);
    const token = await createToken({ subject: user.id });

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('database details');
  });

  it('keeps login public', async () => {
    const app = createApp(database, new MeUserRepository([user]), TEST_JWT_SECRET);

    const response = await request(app).post('/api/auth/login').send({
      email: user.email,
      password: PASSWORD,
    });

    expect(response.status).toBe(200);
  });

  it('keeps registration public', async () => {
    const app = createApp(database, new MeUserRepository([]), TEST_JWT_SECRET);

    const response = await request(app).post('/api/auth/register').send({
      name: 'New User',
      email: 'new@example.com',
      password: PASSWORD,
    });

    expect(response.status).toBe(201);
  });
});
