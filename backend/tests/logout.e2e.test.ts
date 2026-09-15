import request from 'supertest';

import { createApp } from '../src/app.js';
import { SESSION_COOKIE_NAME } from '../src/config/session.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';

const database: DatabaseReadiness = {
  async isReady(): Promise<boolean> {
    return true;
  },
};

describe('POST /api/auth/logout', () => {
  it.each([
    ['with a cookie', `${SESSION_COOKIE_NAME}=existing-token`],
    ['without a cookie', undefined],
  ])('clears the session and succeeds %s', async (_caseName, cookie) => {
    const pendingRequest = request(createApp(database)).post('/api/auth/logout');

    if (cookie) {
      pendingRequest.set('Cookie', cookie);
    }

    const response = await pendingRequest;

    expect(response.status).toBe(204);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({});
    const clearedCookie = response.headers['set-cookie']?.[0];
    expect(clearedCookie).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(clearedCookie).toContain('Path=/');
    expect(clearedCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(clearedCookie).toContain('HttpOnly');
    expect(clearedCookie).toContain('SameSite=Lax');
    expect(clearedCookie).not.toContain('Secure');
  });
});
