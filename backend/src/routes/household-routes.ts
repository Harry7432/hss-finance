import { Router } from 'express';

import { createAddHouseholdMemberController } from '../controllers/add-household-member-controller.js';
import { createHouseholdController } from '../controllers/create-household-controller.js';
import { getHouseholdCategorySummaryController } from '../controllers/get-household-category-summary-controller.js';
import { getHouseholdMonthlySummaryController } from '../controllers/get-household-monthly-summary-controller.js';
import { getHouseholdSummaryController } from '../controllers/get-household-summary-controller.js';
import { getHouseholdUserSummaryController } from '../controllers/get-household-user-summary-controller.js';
import { createListHouseholdMembersController } from '../controllers/list-household-members-controller.js';
import { createListHouseholdsController } from '../controllers/list-households-controller.js';
import { createAuthenticationMiddleware } from '../middleware/authenticate.js';
import type { CategoryRepository } from '../repositories/category-repository.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';
import type { RecurringTransactionRepository } from '../repositories/recurring-transaction-repository.js';
import type { TransactionRepository } from '../repositories/transaction-repository.js';
import type { UserRepository } from '../repositories/user-repository.js';
import { AddHouseholdMemberService } from '../services/add-household-member-service.js';
import { CreateHouseholdService } from '../services/create-household-service.js';
import { GetHouseholdCategorySummaryService } from '../services/get-household-category-summary-service.js';
import { GetHouseholdMonthlySummaryService } from '../services/get-household-monthly-summary-service.js';
import { GetHouseholdSummaryService } from '../services/get-household-summary-service.js';
import { GetHouseholdUserSummaryService } from '../services/get-household-user-summary-service.js';
import { ListHouseholdMembersService } from '../services/list-household-members-service.js';
import { ListHouseholdsService } from '../services/list-households-service.js';
import type { TodayProvider } from '../services/list-transactions-service.js';
import { createCategoryRouter } from './category-routes.js';
import { createRecurringTransactionRouter } from './recurring-transaction-routes.js';
import { createTransactionRouter } from './transaction-routes.js';

export function createHouseholdRouter(
  households: HouseholdRepository,
  users: UserRepository,
  jwtSecret: Uint8Array,
  categories: CategoryRepository,
  transactions: TransactionRepository,
  recurringTransactions: RecurringTransactionRepository,
  todayProvider?: TodayProvider,
): Router {
  const householdRouter = Router();
  const addHouseholdMember = new AddHouseholdMemberService(households, users);
  const createHousehold = new CreateHouseholdService(households);
  const getHouseholdSummary = new GetHouseholdSummaryService(transactions);
  const getHouseholdUserSummary = new GetHouseholdUserSummaryService(transactions);
  const getHouseholdCategorySummary = new GetHouseholdCategorySummaryService(transactions);
  const getHouseholdMonthlySummary = new GetHouseholdMonthlySummaryService(
    transactions,
    todayProvider,
  );
  const listHouseholdMembers = new ListHouseholdMembersService(households);
  const listHouseholds = new ListHouseholdsService(households);

  householdRouter.use(
    '/:householdId/categories',
    createCategoryRouter(categories, households, jwtSecret),
  );
  householdRouter.use(
    '/:householdId/transactions',
    createTransactionRouter(transactions, jwtSecret, todayProvider),
  );
  householdRouter.use(
    '/:householdId/recurring-transactions',
    createRecurringTransactionRouter(recurringTransactions, jwtSecret),
  );

  householdRouter.post(
    '/',
    createAuthenticationMiddleware(jwtSecret),
    createHouseholdController(createHousehold),
  );
  householdRouter.get(
    '/',
    createAuthenticationMiddleware(jwtSecret),
    createListHouseholdsController(listHouseholds),
  );
  householdRouter.get(
    '/:householdId/summary',
    createAuthenticationMiddleware(jwtSecret),
    getHouseholdSummaryController(getHouseholdSummary),
  );
  householdRouter.get(
    '/:householdId/summary/users',
    createAuthenticationMiddleware(jwtSecret),
    getHouseholdUserSummaryController(getHouseholdUserSummary),
  );
  householdRouter.get(
    '/:householdId/summary/categories',
    createAuthenticationMiddleware(jwtSecret),
    getHouseholdCategorySummaryController(getHouseholdCategorySummary),
  );
  householdRouter.get(
    '/:householdId/summary/monthly',
    createAuthenticationMiddleware(jwtSecret),
    getHouseholdMonthlySummaryController(getHouseholdMonthlySummary),
  );
  householdRouter.get(
    '/:householdId/members',
    createAuthenticationMiddleware(jwtSecret),
    createListHouseholdMembersController(listHouseholdMembers),
  );
  householdRouter.post(
    '/:householdId/members',
    createAuthenticationMiddleware(jwtSecret),
    createAddHouseholdMemberController(addHouseholdMember),
  );

  return householdRouter;
}
