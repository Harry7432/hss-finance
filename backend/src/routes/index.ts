import { Router } from 'express';

import type { DatabaseReadiness } from '../database/database-readiness.js';
import type { AsaasWebhookRepository } from '../repositories/asaas-webhook-repository.js';
import type { CategoryRepository } from '../repositories/category-repository.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';
import type { PaymentAttemptRepository } from '../repositories/payment-attempt-repository.js';
import type { RecurringTransactionRepository } from '../repositories/recurring-transaction-repository.js';
import type { TransactionRepository } from '../repositories/transaction-repository.js';
import type { UserRepository } from '../repositories/user-repository.js';
import type { TodayProvider } from '../services/list-transactions-service.js';
import { createAsaasWebhookRouter } from './asaas-webhook-routes.js';
import { createAuthRouter } from './auth-routes.js';
import { createHealthRouter } from './health-routes.js';
import type { AsaasIntegrationClient } from './household-routes.js';
import { createHouseholdRouter } from './household-routes.js';

export function createApiRouter(
  database: DatabaseReadiness,
  users: UserRepository,
  jwtSecret: Uint8Array,
  households: HouseholdRepository,
  categories: CategoryRepository,
  transactions: TransactionRepository,
  paymentAttempts: PaymentAttemptRepository,
  recurringTransactions: RecurringTransactionRepository,
  todayProvider?: TodayProvider,
  secureCookie = false,
  asaasClient?: AsaasIntegrationClient,
  asaasWebhookRepository?: AsaasWebhookRepository,
  asaasWebhookToken?: string,
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
      paymentAttempts,
      recurringTransactions,
      todayProvider,
      asaasClient,
    ),
  );

  // Public, provider-authenticated only (asaas-access-token) — intentionally outside
  // /households and the JWT authenticate middleware. asaasWebhookRepository is always
  // constructed (it only needs a DataSource); asaasWebhookToken is what gates the route.
  if (asaasWebhookRepository) {
    apiRouter.use(
      '/webhooks/asaas',
      createAsaasWebhookRouter(asaasWebhookRepository, asaasWebhookToken),
    );
  }

  return apiRouter;
}
