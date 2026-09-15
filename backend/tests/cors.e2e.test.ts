import request from 'supertest';

import { createApp } from '../src/app.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';

const ALLOWED_ORIGIN = 'http://localhost:5173';
const database: DatabaseReadiness = {
  async isReady(): Promise<boolean> {
    return true;
  },
};

describe('credentialed CORS', () => {
  it('allows the configured frontend origin with credentials', async () => {
    const response = await request(createApp(database))
      .options('/api/auth/me')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers.vary).toContain('Origin');
  });

  it('does not emit CORS access headers for another origin', async () => {
    const response = await request(createApp(database))
      .get('/api/auth/me')
      .set('Origin', 'https://untrusted.example');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('does not approve a preflight from another origin', async () => {
    const response = await request(createApp(database))
      .options('/api/auth/me')
      .set('Origin', 'https://untrusted.example')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('allows server-to-server requests without emitting browser CORS headers', async () => {
    const response = await request(createApp(database)).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
