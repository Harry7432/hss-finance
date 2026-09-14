import { Router } from 'express';

import { createTransactionController } from '../controllers/create-transaction-controller.js';
import { deleteTransactionController } from '../controllers/delete-transaction-controller.js';
import { listTransactionsController } from '../controllers/list-transactions-controller.js';
import { updateTransactionController } from '../controllers/update-transaction-controller.js';
import { createAuthenticationMiddleware } from '../middleware/authenticate.js';
import type { TransactionRepository } from '../repositories/transaction-repository.js';
import { CreateTransactionService } from '../services/create-transaction-service.js';
import { DeleteTransactionService } from '../services/delete-transaction-service.js';
import {
  ListTransactionsService,
  type TodayProvider,
} from '../services/list-transactions-service.js';
import { UpdateTransactionService } from '../services/update-transaction-service.js';

export function createTransactionRouter(
  transactions: TransactionRepository,
  jwtSecret: Uint8Array,
  todayProvider?: TodayProvider,
): Router {
  const transactionRouter = Router({ mergeParams: true });
  const createTransaction = new CreateTransactionService(transactions);
  const deleteTransaction = new DeleteTransactionService(transactions);
  const listTransactions = new ListTransactionsService(transactions, todayProvider);
  const updateTransaction = new UpdateTransactionService(transactions);
  const authenticate = createAuthenticationMiddleware(jwtSecret);

  transactionRouter.get('/', authenticate, listTransactionsController(listTransactions));

  transactionRouter.post('/', authenticate, createTransactionController(createTransaction));

  transactionRouter.patch(
    '/:transactionId',
    authenticate,
    updateTransactionController(updateTransaction),
  );

  transactionRouter.delete(
    '/:transactionId',
    authenticate,
    deleteTransactionController(deleteTransaction),
  );

  return transactionRouter;
}
