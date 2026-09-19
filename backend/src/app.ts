import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { jwtConfig } from './config/jwt.js';
import { databaseReadiness, type DatabaseReadiness } from './database/database-readiness.js';
import { appDataSource } from './database/data-source.js';
import { UserEntity } from './database/entities/user.entity.js';
import { AsaasClient } from './integrations/asaas/asaas-client.js';
import { errorHandler } from './middleware/error-handler.js';
import {
  TypeOrmAsaasWebhookRepository,
  type AsaasWebhookRepository,
} from './repositories/asaas-webhook-repository.js';
import {
  TypeOrmCategoryRepository,
  type CategoryRepository,
} from './repositories/category-repository.js';
import {
  TypeOrmHouseholdRepository,
  type HouseholdRepository,
} from './repositories/household-repository.js';
import {
  TypeOrmPaymentAttemptRepository,
  type PaymentAttemptRepository,
} from './repositories/payment-attempt-repository.js';
import {
  TypeOrmRecurringTransactionRepository,
  type RecurringTransactionRepository,
} from './repositories/recurring-transaction-repository.js';
import {
  TypeOrmTransactionRepository,
  type TransactionRepository,
} from './repositories/transaction-repository.js';
import { TypeOrmUserRepository, type UserRepository } from './repositories/user-repository.js';
import { createApiRouter } from './routes/index.js';
import type { AsaasBillOperationsClient } from './routes/transaction-routes.js';
import type { TodayProvider } from './services/list-transactions-service.js';

const userRepository = new TypeOrmUserRepository(appDataSource.getRepository(UserEntity));
const householdRepository = new TypeOrmHouseholdRepository(appDataSource);
const categoryRepository = new TypeOrmCategoryRepository(appDataSource);
const transactionRepository = new TypeOrmTransactionRepository(appDataSource);
const paymentAttemptRepository = new TypeOrmPaymentAttemptRepository(appDataSource);
const recurringTransactionRepository = new TypeOrmRecurringTransactionRepository(appDataSource);
const asaasWebhookRepository = new TypeOrmAsaasWebhookRepository(appDataSource);
const jwtSecret = Buffer.from(jwtConfig.secret, 'base64');
// Undefined when ASAAS_API_KEY isn't set, so the app still boots (Sandbox-only, key is
// optional at this stage); routes that need it degrade to a 503 instead of crashing.
const defaultAsaasClient = env.asaasApiKey
  ? new AsaasClient({ apiKey: env.asaasApiKey, baseUrl: env.asaasBaseUrl })
  : undefined;

export function createApp(
  database: DatabaseReadiness = databaseReadiness,
  users: UserRepository = userRepository,
  tokenSecret: Uint8Array = jwtSecret,
  households: HouseholdRepository = householdRepository,
  categories: CategoryRepository = categoryRepository,
  transactions: TransactionRepository = transactionRepository,
  paymentAttempts: PaymentAttemptRepository = paymentAttemptRepository,
  recurringTransactions: RecurringTransactionRepository = recurringTransactionRepository,
  todayProvider?: TodayProvider,
  asaasClient: AsaasBillOperationsClient | undefined = defaultAsaasClient,
  asaasWebhooks: AsaasWebhookRepository = asaasWebhookRepository,
  asaasWebhookToken: string | undefined = env.asaasWebhookToken,
): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        callback(null, origin === env.frontendOrigin);
      },
    }),
  );
  app.use(express.json());
  app.use(
    '/api',
    createApiRouter(
      database,
      users,
      tokenSecret,
      households,
      categories,
      transactions,
      paymentAttempts,
      recurringTransactions,
      todayProvider,
      env.secureCookies,
      asaasClient,
      asaasWebhooks,
      asaasWebhookToken,
    ),
  );
  app.use(errorHandler);

  return app;
}

export const app = createApp();
