import { Router } from 'express';

import { createTransactionController } from '../controllers/create-transaction-controller.js';
import { listTransactionsController } from '../controllers/list-transactions-controller.js';
import { createAuthenticationMiddleware } from '../middleware/authenticate.js';
import type { TransactionRepository } from '../repositories/transaction-repository.js';
import { CreateTransactionService } from '../services/create-transaction-service.js';
import { ListTransactionsService } from '../services/list-transactions-service.js';

export function createTransactionRouter(
  transactions: TransactionRepository,
  jwtSecret: Uint8Array,
): Router {
  const transactionRouter = Router({ mergeParams: true });
  const createTransaction = new CreateTransactionService(transactions);
  const listTransactions = new ListTransactionsService(transactions);
  const authenticate = createAuthenticationMiddleware(jwtSecret);

  transactionRouter.get('/', authenticate, listTransactionsController(listTransactions));

  transactionRouter.post('/', authenticate, createTransactionController(createTransaction));

  return transactionRouter;
}
