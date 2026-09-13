import type { Request, RequestHandler, Response } from 'express';

import type { DatabaseReadiness } from '../database/database-readiness.js';

export function getHealth(_request: Request, response: Response): void {
  response.status(200).json({ status: 'ok' });
}

export function createGetReadiness(database: DatabaseReadiness): RequestHandler {
  return async function getReadiness(_request, response): Promise<void> {
    const isDatabaseReady = await database.isReady();

    if (!isDatabaseReady) {
      response.status(503).json({
        status: 'unavailable',
        services: {
          api: 'available',
          database: 'unavailable',
        },
      });
      return;
    }

    response.status(200).json({
      status: 'ok',
      services: {
        api: 'available',
        database: 'available',
      },
    });
  };
}
