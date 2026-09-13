import request from 'supertest';

import { createApp } from '../src/app.js';
import type { DatabaseReadiness } from '../src/database/database-readiness.js';

describe('GET /api/health/ready', () => {
  it('returns 200 when the database is available', async () => {
    let readinessChecks = 0;
    const database: DatabaseReadiness = {
      async isReady(): Promise<boolean> {
        readinessChecks += 1;
        return true;
      },
    };
    const app = createApp(database);

    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      services: {
        api: 'available',
        database: 'available',
      },
    });
    expect(readinessChecks).toBe(1);
  });

  it('returns 503 when the database is unavailable', async () => {
    let readinessChecks = 0;
    const database: DatabaseReadiness = {
      async isReady(): Promise<boolean> {
        readinessChecks += 1;
        return false;
      },
    };
    const app = createApp(database);

    const response = await request(app).get('/api/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unavailable',
      services: {
        api: 'available',
        database: 'unavailable',
      },
    });
    expect(readinessChecks).toBe(1);
  });
});
