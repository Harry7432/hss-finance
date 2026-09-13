import { Router } from 'express';

import { createTransactionController } from '../controllers/create-transaction-controller.js';
import { createAuthenticationMiddleware } from '../middleware/authenticate.js';
import type { TransactionRepository } from '../repositories/transaction-repository.js';
import { CreateTransactionService } from '../services/create-transaction-service.js';

export function createTransactionRouter(
  transactions: TransactionRepository,
  jwtSecret: Uint8Array,
): Router {
  const transactionRouter = Router({ mergeParams: true });
  const createTransaction = new CreateTransactionService(transactions);

  transactionRouter.post(
    '/',
    createAuthenticationMiddleware(jwtSecret),
    createTransactionController(createTransaction),
  );

  return transactionRouter;
}
