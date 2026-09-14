import { Router } from 'express';

import { createRecurringTransactionController } from '../controllers/create-recurring-transaction-controller.js';
import { generateRecurringTransactionsController } from '../controllers/generate-recurring-transactions-controller.js';
import { listRecurringTransactionsController } from '../controllers/list-recurring-transactions-controller.js';
import { updateRecurringTransactionController } from '../controllers/update-recurring-transaction-controller.js';
import { createAuthenticationMiddleware } from '../middleware/authenticate.js';
import type { RecurringTransactionRepository } from '../repositories/recurring-transaction-repository.js';
import { CreateRecurringTransactionService } from '../services/create-recurring-transaction-service.js';
import { GenerateRecurringTransactionsService } from '../services/generate-recurring-transactions-service.js';
import { ListRecurringTransactionsService } from '../services/list-recurring-transactions-service.js';
import { UpdateRecurringTransactionService } from '../services/update-recurring-transaction-service.js';

export function createRecurringTransactionRouter(
  recurringTransactions: RecurringTransactionRepository,
  jwtSecret: Uint8Array,
): Router {
  const recurringTransactionRouter = Router({ mergeParams: true });
  const createRecurringTransaction = new CreateRecurringTransactionService(recurringTransactions);
  const listRecurringTransactions = new ListRecurringTransactionsService(recurringTransactions);
  const updateRecurringTransaction = new UpdateRecurringTransactionService(recurringTransactions);
  const generateRecurringTransactions = new GenerateRecurringTransactionsService(
    recurringTransactions,
  );
  const authenticate = createAuthenticationMiddleware(jwtSecret);

  recurringTransactionRouter.get(
    '/',
    authenticate,
    listRecurringTransactionsController(listRecurringTransactions),
  );

  recurringTransactionRouter.post(
    '/',
    authenticate,
    createRecurringTransactionController(createRecurringTransaction),
  );

  recurringTransactionRouter.post(
    '/generate',
    authenticate,
    generateRecurringTransactionsController(generateRecurringTransactions),
  );

  recurringTransactionRouter.patch(
    '/:recurringTransactionId',
    authenticate,
    updateRecurringTransactionController(updateRecurringTransaction),
  );

  return recurringTransactionRouter;
}
