import { Router } from 'express';

import type { DatabaseReadiness } from '../database/database-readiness.js';
import type { CategoryRepository } from '../repositories/category-repository.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';
import type { UserRepository } from '../repositories/user-repository.js';
import { createAuthRouter } from './auth-routes.js';
import { createHealthRouter } from './health-routes.js';
import { createHouseholdRouter } from './household-routes.js';

export function createApiRouter(
  database: DatabaseReadiness,
  users: UserRepository,
  jwtSecret: Uint8Array,
  households: HouseholdRepository,
  categories: CategoryRepository,
): Router {
  const apiRouter = Router();

  apiRouter.use('/auth', createAuthRouter(users, jwtSecret));
  apiRouter.use('/health', createHealthRouter(database));
  apiRouter.use('/households', createHouseholdRouter(households, users, jwtSecret, categories));

  return apiRouter;
}
