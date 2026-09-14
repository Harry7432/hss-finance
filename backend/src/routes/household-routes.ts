import { Router } from 'express';

import { createAddHouseholdMemberController } from '../controllers/add-household-member-controller.js';
import { createHouseholdController } from '../controllers/create-household-controller.js';
import { createListHouseholdMembersController } from '../controllers/list-household-members-controller.js';
import { createListHouseholdsController } from '../controllers/list-households-controller.js';
import { createAuthenticationMiddleware } from '../middleware/authenticate.js';
import type { CategoryRepository } from '../repositories/category-repository.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';
import type { TransactionRepository } from '../repositories/transaction-repository.js';
import type { UserRepository } from '../repositories/user-repository.js';
import { AddHouseholdMemberService } from '../services/add-household-member-service.js';
import { CreateHouseholdService } from '../services/create-household-service.js';
import { ListHouseholdMembersService } from '../services/list-household-members-service.js';
import { ListHouseholdsService } from '../services/list-households-service.js';
import type { TodayProvider } from '../services/list-transactions-service.js';
import { createCategoryRouter } from './category-routes.js';
import { createTransactionRouter } from './transaction-routes.js';

export function createHouseholdRouter(
  households: HouseholdRepository,
  users: UserRepository,
  jwtSecret: Uint8Array,
  categories: CategoryRepository,
  transactions: TransactionRepository,
  todayProvider?: TodayProvider,
): Router {
  const householdRouter = Router();
  const addHouseholdMember = new AddHouseholdMemberService(households, users);
  const createHousehold = new CreateHouseholdService(households);
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
