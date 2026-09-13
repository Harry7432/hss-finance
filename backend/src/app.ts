import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { databaseReadiness, type DatabaseReadiness } from './database/database-readiness.js';
import { createApiRouter } from './routes/index.js';

export function createApp(database: DatabaseReadiness = databaseReadiness): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());
  app.use('/api', createApiRouter(database));

  return app;
}

export const app = createApp();
