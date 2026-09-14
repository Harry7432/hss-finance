import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { env } from '../config/env.js';
import { CategoryEntity } from './entities/category.entity.js';
import { HouseholdMemberEntity } from './entities/household-member.entity.js';
import { HouseholdEntity } from './entities/household.entity.js';
import { RecurringTransactionEntity } from './entities/recurring-transaction.entity.js';
import { TransactionEntity } from './entities/transaction.entity.js';
import { UserEntity } from './entities/user.entity.js';
import { CreateInitialDomain1789300800000 } from './migrations/1789300800000-create-initial-domain.js';
import { AddTransactionExpenseNature1789360000000 } from './migrations/1789360000000-add-transaction-expense-nature.js';
import { AddRecurringTransactions1789370000000 } from './migrations/1789370000000-add-recurring-transactions.js';

export const appDataSource = new DataSource({
  type: 'postgres',
  url: env.databaseUrl,
  synchronize: false,
  logging: env.databaseLogging,
  entities: [
    UserEntity,
    HouseholdEntity,
    HouseholdMemberEntity,
    CategoryEntity,
    TransactionEntity,
    RecurringTransactionEntity,
  ],
  migrations: [
    CreateInitialDomain1789300800000,
    AddTransactionExpenseNature1789360000000,
    AddRecurringTransactions1789370000000,
  ],
  subscribers: [],
  uuidExtension: 'pgcrypto',
  connectTimeoutMS: 5_000,
  extra: {
    max: 10,
  },
});
