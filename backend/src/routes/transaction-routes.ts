import { Router } from 'express';

import { createTransactionController } from '../controllers/create-transaction-controller.js';
import { deleteTransactionController } from '../controllers/delete-transaction-controller.js';
import { listTransactionsController } from '../controllers/list-transactions-controller.js';
import { payBillController } from '../controllers/pay-bill-controller.js';
import { simulateBillPaymentController } from '../controllers/simulate-bill-payment-controller.js';
import { updateTransactionController } from '../controllers/update-transaction-controller.js';
import { createAuthenticationMiddleware } from '../middleware/authenticate.js';
import type { PaymentAttemptRepository } from '../repositories/payment-attempt-repository.js';
import type { TransactionRepository } from '../repositories/transaction-repository.js';
import { CreateTransactionService } from '../services/create-transaction-service.js';
import { DeleteTransactionService } from '../services/delete-transaction-service.js';
import {
  ListTransactionsService,
  type TodayProvider,
} from '../services/list-transactions-service.js';
import type { PayBillClient } from '../services/pay-bill-service.js';
import { PayBillService } from '../services/pay-bill-service.js';
import type { BillSimulationClient } from '../services/simulate-bill-payment-service.js';
import { SimulateBillPaymentService } from '../services/simulate-bill-payment-service.js';
import { UpdateTransactionService } from '../services/update-transaction-service.js';

export type AsaasBillOperationsClient = BillSimulationClient & PayBillClient;

export function createTransactionRouter(
  transactions: TransactionRepository,
  paymentAttempts: PaymentAttemptRepository,
  jwtSecret: Uint8Array,
  todayProvider?: TodayProvider,
  asaasClient?: AsaasBillOperationsClient,
): Router {
  const transactionRouter = Router({ mergeParams: true });
  const createTransaction = new CreateTransactionService(transactions);
  const deleteTransaction = new DeleteTransactionService(transactions);
  const listTransactions = new ListTransactionsService(transactions, todayProvider);
  const updateTransaction = new UpdateTransactionService(transactions);
  const simulateBillPayment = asaasClient
    ? new SimulateBillPaymentService(transactions, asaasClient)
    : undefined;
  const payBill = asaasClient
    ? new PayBillService(transactions, paymentAttempts, asaasClient)
    : undefined;
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

  transactionRouter.post(
    '/:transactionId/payment/bill/simulate',
    authenticate,
    simulateBillPaymentController(simulateBillPayment),
  );

  transactionRouter.post('/:transactionId/payment/bill', authenticate, payBillController(payBill));

  return transactionRouter;
}
