import { Router } from 'express';

import { getAsaasBalanceController } from '../controllers/get-asaas-balance-controller.js';
import { listAsaasFinancialTransactionsController } from '../controllers/list-asaas-financial-transactions-controller.js';
import { createAuthenticationMiddleware } from '../middleware/authenticate.js';
import type { HouseholdRepository } from '../repositories/household-repository.js';
import type { AsaasBalanceClient } from '../services/get-asaas-balance-service.js';
import { GetAsaasBalanceService } from '../services/get-asaas-balance-service.js';
import type { AsaasFinancialTransactionsClient } from '../services/list-asaas-financial-transactions-service.js';
import { ListAsaasFinancialTransactionsService } from '../services/list-asaas-financial-transactions-service.js';

export type AsaasAccountClient = AsaasBalanceClient & AsaasFinancialTransactionsClient;

export function createAsaasAccountRouter(
  households: HouseholdRepository,
  jwtSecret: Uint8Array,
  asaasClient?: AsaasAccountClient,
): Router {
  const asaasAccountRouter = Router({ mergeParams: true });
  const getBalance = asaasClient ? new GetAsaasBalanceService(households, asaasClient) : undefined;
  const listFinancialTransactions = asaasClient
    ? new ListAsaasFinancialTransactionsService(households, asaasClient)
    : undefined;
  const authenticate = createAuthenticationMiddleware(jwtSecret);

  asaasAccountRouter.get('/balance', authenticate, getAsaasBalanceController(getBalance));

  asaasAccountRouter.get(
    '/financial-transactions',
    authenticate,
    listAsaasFinancialTransactionsController(listFinancialTransactions),
  );

  return asaasAccountRouter;
}
