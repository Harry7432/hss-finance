import { Router } from 'express';

import type { DatabaseReadiness } from '../database/database-readiness.js';
import type { UserRepository } from '../repositories/user-repository.js';
import { createAuthRouter } from './auth-routes.js';
import { createHealthRouter } from './health-routes.js';

export function createApiRouter(
  database: DatabaseReadiness,
  users: UserRepository,
  jwtSecret: Uint8Array,
): Router {
  const apiRouter = Router();

  apiRouter.use('/auth', createAuthRouter(users, jwtSecret));
  apiRouter.use('/health', createHealthRouter(database));

  return apiRouter;
}
