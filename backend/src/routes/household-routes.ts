import { Router } from 'express';

import { createHouseholdController } from '../controllers/create-household-controller.js';
import { createListHouseholdMembersController } from '../controllers/list-household-members-controller.js';
import { createListHouseholdsController } from '../controllers/list-households-controller.js';
import { createAuthenticationMiddleware } from '../middleware/authenticate.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';
import { CreateHouseholdService } from '../services/create-household-service.js';
import { ListHouseholdMembersService } from '../services/list-household-members-service.js';
import { ListHouseholdsService } from '../services/list-households-service.js';

export function createHouseholdRouter(
  households: HouseholdRepository,
  jwtSecret: Uint8Array,
): Router {
  const householdRouter = Router();
  const createHousehold = new CreateHouseholdService(households);
  const listHouseholdMembers = new ListHouseholdMembersService(households);
  const listHouseholds = new ListHouseholdsService(households);

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

  return householdRouter;
}
