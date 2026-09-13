import { Router } from 'express';

import { createGetReadiness, getHealth } from '../controllers/health-controller.js';
import type { DatabaseReadiness } from '../database/database-readiness.js';

export function createHealthRouter(database: DatabaseReadiness): Router {
  const healthRouter = Router();

  healthRouter.get('/', getHealth);
  healthRouter.get('/ready', createGetReadiness(database));

  return healthRouter;
}
