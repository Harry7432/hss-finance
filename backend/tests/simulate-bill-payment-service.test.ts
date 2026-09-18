import { AsaasClientError } from '../src/integrations/asaas/asaas-client.error.js';
import type {
  AsaasBillSimulation,
  AsaasSimulateBillPaymentInput,
} from '../src/integrations/asaas/asaas-client.js';
import { ForbiddenError } from '../src/errors/forbidden-error.js';
import { TransactionAlreadyPaidError } from '../src/errors/transaction-already-paid-error.js';
import { TransactionNotFoundError } from '../src/errors/transaction-not-found-error.js';
import type {
  FindPendingTransactionAsOwnerData,
  TransactionRecord,
  TransactionRepository,
} from '../src/repositories/transaction-repository.js';
import type { BillSimulationClient } from '../src/services/simulate-bill-payment-service.js';
import { SimulateBillPaymentService } from '../src/services/simulate-bill-payment-service.js';

const HOUSEHOLD_ID = 'household-1';
const REQUESTER_ID = 'user-1';
const TRANSACTION_ID = 'transaction-1';
const IDENTIFICATION_FIELD = '03399.77779 29900.000000 04751.101017 1 81510000002990';

function pendingTransaction(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: TRANSACTION_ID,
    type: 'expense',
    amount: '150.00',
    transactionDate: '2024-02-01',
    dueDate: '2024-02-10',
    categoryId: null,
    description: null,
    status: 'pending',
    paidAt: null,
    source: 'manual',
    expenseNature: null,
    recurringTransactionId: null,
    recurringPeriod: null,
    createdBy: REQUESTER_ID,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function simulation(overrides: Partial<AsaasBillSimulation> = {}): AsaasBillSimulation {
  return {
    value: 150,
    originalValue: 150,
    dueDate: '2024-02-10',
    isOverdue: false,
    allowChangeValue: false,
    minValue: null,
    maxValue: null,
    beneficiaryName: 'Beneficiary Co',
    companyName: 'Issuer Co',
    fee: 1.5,
    minimumScheduleDate: '2024-01-15',
    ...overrides,
  };
}

class FakeTransactionRepository implements Pick<TransactionRepository, 'findPendingAsOwner'> {
  calls: FindPendingTransactionAsOwnerData[] = [];

  constructor(private readonly result: TransactionRecord | Error = pendingTransaction()) {}

  async findPendingAsOwner(data: FindPendingTransactionAsOwnerData): Promise<TransactionRecord> {
    this.calls.push(data);

    if (this.result instanceof Error) {
      throw this.result;
    }

    return this.result;
  }
}

class FakeAsaasClient implements BillSimulationClient {
  calls: AsaasSimulateBillPaymentInput[] = [];

  constructor(private readonly result: AsaasBillSimulation | Error = simulation()) {}

  async simulateBillPayment(input: AsaasSimulateBillPaymentInput): Promise<AsaasBillSimulation> {
    this.calls.push(input);

    if (this.result instanceof Error) {
      throw this.result;
    }

    return this.result;
  }
}

function buildService(
  transactions: Pick<TransactionRepository, 'findPendingAsOwner'>,
  asaasClient: BillSimulationClient,
): SimulateBillPaymentService {
  return new SimulateBillPaymentService(transactions as TransactionRepository, asaasClient);
}

describe('SimulateBillPaymentService', () => {
  it('fetches the pending transaction scoped to the household before calling Asaas', async () => {
    const transactions = new FakeTransactionRepository();
    const asaasClient = new FakeAsaasClient();
    const service = buildService(transactions, asaasClient);

    await service.execute({
      householdId: HOUSEHOLD_ID,
      requesterId: REQUESTER_ID,
      transactionId: TRANSACTION_ID,
      identificationField: IDENTIFICATION_FIELD,
    });

    expect(transactions.calls).toEqual([
      {
        householdId: HOUSEHOLD_ID,
        requesterId: REQUESTER_ID,
        transactionId: TRANSACTION_ID,
      },
    ]);
  });

  it('forwards the identificationField to the Asaas client', async () => {
    const transactions = new FakeTransactionRepository();
    const asaasClient = new FakeAsaasClient();
    const service = buildService(transactions, asaasClient);

    await service.execute({
      householdId: HOUSEHOLD_ID,
      requesterId: REQUESTER_ID,
      transactionId: TRANSACTION_ID,
      identificationField: IDENTIFICATION_FIELD,
    });

    expect(asaasClient.calls).toEqual([{ identificationField: IDENTIFICATION_FIELD }]);
  });

  it('returns the transaction, the simulation and a match flag when amounts are equal', async () => {
    const transactions = new FakeTransactionRepository(pendingTransaction({ amount: '150.00' }));
    const asaasClient = new FakeAsaasClient(simulation({ value: 150 }));
    const service = buildService(transactions, asaasClient);

    const result = await service.execute({
      householdId: HOUSEHOLD_ID,
      requesterId: REQUESTER_ID,
      transactionId: TRANSACTION_ID,
      identificationField: IDENTIFICATION_FIELD,
    });

    expect(result.amountMatchesTransaction).toBe(true);
    expect(result.transaction).toEqual({ id: TRANSACTION_ID, amount: '150.00', status: 'pending' });
    expect(result.simulation).toEqual(simulation({ value: 150 }));
  });

  it('flags a divergence without rejecting when the simulated value differs from the transaction amount', async () => {
    const transactions = new FakeTransactionRepository(pendingTransaction({ amount: '150.00' }));
    const asaasClient = new FakeAsaasClient(simulation({ value: 155.3 }));
    const service = buildService(transactions, asaasClient);

    const result = await service.execute({
      householdId: HOUSEHOLD_ID,
      requesterId: REQUESTER_ID,
      transactionId: TRANSACTION_ID,
      identificationField: IDENTIFICATION_FIELD,
    });

    expect(result.amountMatchesTransaction).toBe(false);
    expect(result.simulation.value).toBe(155.3);
  });

  it('does not mutate the transaction status when amounts diverge', async () => {
    const transactions = new FakeTransactionRepository(pendingTransaction({ amount: '150.00' }));
    const asaasClient = new FakeAsaasClient(simulation({ value: 999 }));
    const service = buildService(transactions, asaasClient);

    const result = await service.execute({
      householdId: HOUSEHOLD_ID,
      requesterId: REQUESTER_ID,
      transactionId: TRANSACTION_ID,
      identificationField: IDENTIFICATION_FIELD,
    });

    expect(result.transaction.status).toBe('pending');
  });

  it('propagates ForbiddenError from the repository without calling Asaas', async () => {
    const transactions = new FakeTransactionRepository(new ForbiddenError());
    const asaasClient = new FakeAsaasClient();
    const service = buildService(transactions, asaasClient);

    await expect(
      service.execute({
        householdId: HOUSEHOLD_ID,
        requesterId: REQUESTER_ID,
        transactionId: TRANSACTION_ID,
        identificationField: IDENTIFICATION_FIELD,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(asaasClient.calls).toHaveLength(0);
  });

  it('propagates TransactionNotFoundError from the repository without calling Asaas', async () => {
    const transactions = new FakeTransactionRepository(new TransactionNotFoundError());
    const asaasClient = new FakeAsaasClient();
    const service = buildService(transactions, asaasClient);

    await expect(
      service.execute({
        householdId: HOUSEHOLD_ID,
        requesterId: REQUESTER_ID,
        transactionId: TRANSACTION_ID,
        identificationField: IDENTIFICATION_FIELD,
      }),
    ).rejects.toBeInstanceOf(TransactionNotFoundError);

    expect(asaasClient.calls).toHaveLength(0);
  });

  it('propagates TransactionAlreadyPaidError from the repository without calling Asaas', async () => {
    const transactions = new FakeTransactionRepository(new TransactionAlreadyPaidError());
    const asaasClient = new FakeAsaasClient();
    const service = buildService(transactions, asaasClient);

    await expect(
      service.execute({
        householdId: HOUSEHOLD_ID,
        requesterId: REQUESTER_ID,
        transactionId: TRANSACTION_ID,
        identificationField: IDENTIFICATION_FIELD,
      }),
    ).rejects.toBeInstanceOf(TransactionAlreadyPaidError);

    expect(asaasClient.calls).toHaveLength(0);
  });

  it('propagates AsaasClientError from the client', async () => {
    const transactions = new FakeTransactionRepository();
    const asaasClient = new FakeAsaasClient(
      new AsaasClientError({ code: 'invalid_request', message: 'Asaas rejected the bill' }),
    );
    const service = buildService(transactions, asaasClient);

    await expect(
      service.execute({
        householdId: HOUSEHOLD_ID,
        requesterId: REQUESTER_ID,
        transactionId: TRANSACTION_ID,
        identificationField: IDENTIFICATION_FIELD,
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});
