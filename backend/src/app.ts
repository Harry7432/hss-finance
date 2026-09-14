import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { jwtConfig } from './config/jwt.js';
import { databaseReadiness, type DatabaseReadiness } from './database/database-readiness.js';
import { appDataSource } from './database/data-source.js';
import { UserEntity } from './database/entities/user.entity.js';
import { errorHandler } from './middleware/error-handler.js';
import {
  TypeOrmCategoryRepository,
  type CategoryRepository,
} from './repositories/category-repository.js';
import {
  TypeOrmHouseholdRepository,
  type HouseholdRepository,
} from './repositories/household-repository.js';
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
import type { TodayProvider } from './services/list-transactions-service.js';

const userRepository = new TypeOrmUserRepository(appDataSource.getRepository(UserEntity));
const householdRepository = new TypeOrmHouseholdRepository(appDataSource);
const categoryRepository = new TypeOrmCategoryRepository(appDataSource);
const transactionRepository = new TypeOrmTransactionRepository(appDataSource);
const recurringTransactionRepository = new TypeOrmRecurringTransactionRepository(appDataSource);
const jwtSecret = Buffer.from(jwtConfig.secret, 'base64');

export function createApp(
  database: DatabaseReadiness = databaseReadiness,
  users: UserRepository = userRepository,
  tokenSecret: Uint8Array = jwtSecret,
  households: HouseholdRepository = householdRepository,
  categories: CategoryRepository = categoryRepository,
  transactions: TransactionRepository = transactionRepository,
  recurringTransactions: RecurringTransactionRepository = recurringTransactionRepository,
  todayProvider?: TodayProvider,
): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
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
      recurringTransactions,
      todayProvider,
    ),
  );
  app.use(errorHandler);

  return app;
}

export const app = createApp();
