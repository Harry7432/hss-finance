import { Router } from 'express';

import type { DatabaseReadiness } from '../database/database-readiness.js';
import type { CategoryRepository } from '../repositories/category-repository.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';
import type { RecurringTransactionRepository } from '../repositories/recurring-transaction-repository.js';
import type { TransactionRepository } from '../repositories/transaction-repository.js';
import type { UserRepository } from '../repositories/user-repository.js';
import type { TodayProvider } from '../services/list-transactions-service.js';
import { createAuthRouter } from './auth-routes.js';
import { createHealthRouter } from './health-routes.js';
import { createHouseholdRouter } from './household-routes.js';

export function createApiRouter(
  database: DatabaseReadiness,
  users: UserRepository,
  jwtSecret: Uint8Array,
  households: HouseholdRepository,
  categories: CategoryRepository,
  transactions: TransactionRepository,
  recurringTransactions: RecurringTransactionRepository,
  todayProvider?: TodayProvider,
  secureCookie = false,
): Router {
  const apiRouter = Router();

  apiRouter.use('/auth', createAuthRouter(users, jwtSecret, secureCookie));
  apiRouter.use('/health', createHealthRouter(database));
  apiRouter.use(
    '/households',
    createHouseholdRouter(
      households,
      users,
      jwtSecret,
      categories,
      transactions,
      recurringTransactions,
      todayProvider,
    ),
  );

  return apiRouter;
}
