import { Router } from 'express';

import type { DatabaseReadiness } from '../database/database-readiness.js';
import { createHealthRouter } from './health-routes.js';

export function createApiRouter(database: DatabaseReadiness): Router {
  const apiRouter = Router();

  apiRouter.use('/health', createHealthRouter(database));

  return apiRouter;
}
