import { AsaasClientError } from '../src/integrations/asaas/asaas-client.error.js';
import type {
  AsaasBillPayment,
  AsaasCreateBillPaymentInput,
} from '../src/integrations/asaas/asaas-client.js';
import { ForbiddenError } from '../src/errors/forbidden-error.js';
import { InvalidPaymentAmountError } from '../src/errors/invalid-payment-amount-error.js';
import { PaymentAttemptAlreadyActiveError } from '../src/errors/payment-attempt-already-active-error.js';
import type {
  CreatePaymentAttemptData,
  MarkPaymentAttemptOutcomeData,
  MarkPaymentAttemptProcessingData,
  PaymentAttemptRecord,
  PaymentAttemptRepository,
} from '../src/repositories/payment-attempt-repository.js';
import type {
  FindPendingTransactionAsOwnerData,
  TransactionRecord,
  TransactionRepository,
} from '../src/repositories/transaction-repository.js';
import { TransactionAlreadyPaidError } from '../src/errors/transaction-already-paid-error.js';
import { TransactionNotFoundError } from '../src/errors/transaction-not-found-error.js';
import type { PayBillClient } from '../src/services/pay-bill-service.js';
import { PayBillService } from '../src/services/pay-bill-service.js';

const HOUSEHOLD_ID = 'household-1';
const REQUESTER_ID = 'user-1';
const TRANSACTION_ID = 'transaction-1';
const PAYMENT_ATTEMPT_ID = 'attempt-1';
const IDENTIFICATION_FIELD = '03399.77779 29900.000000 04751.101017 1 81510000002990';

function pendingTransaction(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: TRANSACTION_ID,
    type: 'expense',
    amount: '150.00',
    transactionDate: '2026-09-13',
    dueDate: '2026-09-20',
    categoryId: null,
    description: null,
    status: 'pending',
    paidAt: null,
    source: 'manual',
    expenseNature: null,
    recurringTransactionId: null,
    recurringPeriod: null,
    createdBy: REQUESTER_ID,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

function paymentAttempt(overrides: Partial<PaymentAttemptRecord> = {}): PaymentAttemptRecord {
  return {
    id: PAYMENT_ATTEMPT_ID,
    transactionId: TRANSACTION_ID,
    initiatedBy: REQUESTER_ID,
    kind: 'bill',
    provider: 'asaas',
    providerResourceId: null,
    idempotencyKey: 'idempotency-key-1',
    status: 'requested',
    requestedAmount: '150.00',
    failureReason: null,
    createdAt: new Date('2026-09-13T10:00:00.000Z'),
    updatedAt: new Date('2026-09-13T10:00:00.000Z'),
    confirmedAt: null,
    ...overrides,
  };
}

function billPayment(overrides: Partial<AsaasBillPayment> = {}): AsaasBillPayment {
  return {
    id: 'bill_000001',
    status: 'PENDING',
    value: 150,
    dueDate: '2026-09-20',
    scheduleDate: '2026-09-18',
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

class FakePaymentAttemptRepository implements PaymentAttemptRepository {
  createCalls: CreatePaymentAttemptData[] = [];
  markProcessingCalls: MarkPaymentAttemptProcessingData[] = [];
  markFailedCalls: MarkPaymentAttemptOutcomeData[] = [];
  markUncertainCalls: MarkPaymentAttemptOutcomeData[] = [];

  constructor(
    private readonly createResult: PaymentAttemptRecord | Error = paymentAttempt(),
    private readonly markProcessingResult: PaymentAttemptRecord | Error = paymentAttempt({
      status: 'processing',
      providerResourceId: 'bill_000001',
    }),
    private readonly markUncertainResult?: PaymentAttemptRecord | Error,
  ) {}

  async createPaymentAttempt(data: CreatePaymentAttemptData): Promise<PaymentAttemptRecord> {
    this.createCalls.push(data);

    if (this.createResult instanceof Error) {
      throw this.createResult;
    }

    return this.createResult;
  }

  async markProcessing(data: MarkPaymentAttemptProcessingData): Promise<PaymentAttemptRecord> {
    this.markProcessingCalls.push(data);

    if (this.markProcessingResult instanceof Error) {
      throw this.markProcessingResult;
    }

    return this.markProcessingResult;
  }

  async markFailed(data: MarkPaymentAttemptOutcomeData): Promise<PaymentAttemptRecord> {
    this.markFailedCalls.push(data);
    return paymentAttempt({ status: 'failed', failureReason: data.failureReason });
  }

  async markUncertain(data: MarkPaymentAttemptOutcomeData): Promise<PaymentAttemptRecord> {
    this.markUncertainCalls.push(data);

    if (this.markUncertainResult instanceof Error) {
      throw this.markUncertainResult;
    }

    return (
      this.markUncertainResult ??
      paymentAttempt({
        status: 'uncertain',
        failureReason: data.failureReason,
        providerResourceId: data.providerResourceId ?? null,
      })
    );
  }
}

class FakePayBillClient implements PayBillClient {
  calls: AsaasCreateBillPaymentInput[] = [];

  constructor(private readonly result: AsaasBillPayment | Error = billPayment()) {}

  async createBillPayment(input: AsaasCreateBillPaymentInput): Promise<AsaasBillPayment> {
    this.calls.push(input);

    if (this.result instanceof Error) {
      throw this.result;
    }

    return this.result;
  }
}

function buildService(
  transactions: Pick<TransactionRepository, 'findPendingAsOwner'>,
  paymentAttempts: PaymentAttemptRepository,
  asaasClient: PayBillClient,
): PayBillService {
  return new PayBillService(transactions as TransactionRepository, paymentAttempts, asaasClient);
}

describe('PayBillService', () => {
  it('fetches the pending transaction scoped to the household before creating a payment attempt', async () => {
    const transactions = new FakeTransactionRepository();
    const paymentAttempts = new FakePaymentAttemptRepository();
    const asaasClient = new FakePayBillClient();
    const service = buildService(transactions, paymentAttempts, asaasClient);

    await service.execute({
      householdId: HOUSEHOLD_ID,
      requesterId: REQUESTER_ID,
      transactionId: TRANSACTION_ID,
      identificationField: IDENTIFICATION_FIELD,
    });

    expect(transactions.calls).toEqual([
      { householdId: HOUSEHOLD_ID, requesterId: REQUESTER_ID, transactionId: TRANSACTION_ID },
    ]);
  });

  it('creates a payment attempt of kind bill with the transaction amount before calling Asaas', async () => {
    const transactions = new FakeTransactionRepository(pendingTransaction({ amount: '150.00' }));
    const paymentAttempts = new FakePaymentAttemptRepository();
    const asaasClient = new FakePayBillClient();
    const service = buildService(transactions, paymentAttempts, asaasClient);

    await service.execute({
      householdId: HOUSEHOLD_ID,
      requesterId: REQUESTER_ID,
      transactionId: TRANSACTION_ID,
      identificationField: IDENTIFICATION_FIELD,
    });

    expect(paymentAttempts.createCalls).toEqual([
      {
        householdId: HOUSEHOLD_ID,
        requesterId: REQUESTER_ID,
        transactionId: TRANSACTION_ID,
        kind: 'bill',
        requestedAmount: '150.00',
      },
    ]);
  });

  it('creates the payment attempt before calling Asaas, not after', async () => {
    const transactions = new FakeTransactionRepository();
    const paymentAttempts = new FakePaymentAttemptRepository();
    const asaasClient = new FakePayBillClient();
    const service = buildService(transactions, paymentAttempts, asaasClient);

    await service.execute({
      householdId: HOUSEHOLD_ID,
      requesterId: REQUESTER_ID,
      transactionId: TRANSACTION_ID,
      identificationField: IDENTIFICATION_FIELD,
    });

    expect(paymentAttempts.createCalls).toHaveLength(1);
    expect(asaasClient.calls).toEqual([
      { identificationField: IDENTIFICATION_FIELD, externalReference: PAYMENT_ATTEMPT_ID },
    ]);
  });

  it('sends the payment attempt id as externalReference, not the idempotencyKey', async () => {
    const transactions = new FakeTransactionRepository();
    const paymentAttempts = new FakePaymentAttemptRepository(
      paymentAttempt({
        id: PAYMENT_ATTEMPT_ID,
        idempotencyKey: 'idempotency-key-should-not-be-used',
      }),
    );
    const asaasClient = new FakePayBillClient();
    const service = buildService(transactions, paymentAttempts, asaasClient);

    await service.execute({
      householdId: HOUSEHOLD_ID,
      requesterId: REQUESTER_ID,
      transactionId: TRANSACTION_ID,
      identificationField: IDENTIFICATION_FIELD,
    });

    expect(asaasClient.calls[0]?.externalReference).toBe(PAYMENT_ATTEMPT_ID);
    expect(asaasClient.calls[0]?.externalReference).not.toBe('idempotency-key-should-not-be-used');
  });

  it('marks the attempt processing with the provider resource id on success', async () => {
    const transactions = new FakeTransactionRepository();
    const paymentAttempts = new FakePaymentAttemptRepository();
    const asaasClient = new FakePayBillClient(billPayment({ id: 'bill_999', status: 'PENDING' }));
    const service = buildService(transactions, paymentAttempts, asaasClient);

    const result = await service.execute({
      householdId: HOUSEHOLD_ID,
      requesterId: REQUESTER_ID,
      transactionId: TRANSACTION_ID,
      identificationField: IDENTIFICATION_FIELD,
    });

    expect(paymentAttempts.markProcessingCalls).toEqual([
      { paymentAttemptId: PAYMENT_ATTEMPT_ID, providerResourceId: 'bill_999' },
    ]);
    expect(result.paymentAttempt).toEqual({
      id: PAYMENT_ATTEMPT_ID,
      status: 'processing',
      kind: 'bill',
    });
    expect(result.provider).toEqual({ status: 'PENDING' });
  });

  it('never returns the identificationField in the result', async () => {
    const transactions = new FakeTransactionRepository();
    const paymentAttempts = new FakePaymentAttemptRepository();
    const asaasClient = new FakePayBillClient();
    const service = buildService(transactions, paymentAttempts, asaasClient);

    const result = await service.execute({
      householdId: HOUSEHOLD_ID,
      requesterId: REQUESTER_ID,
      transactionId: TRANSACTION_ID,
      identificationField: IDENTIFICATION_FIELD,
    });

    expect(JSON.stringify(result)).not.toContain(IDENTIFICATION_FIELD);
  });

  it('propagates ForbiddenError from the repository without creating a payment attempt', async () => {
    const transactions = new FakeTransactionRepository(new ForbiddenError());
    const paymentAttempts = new FakePaymentAttemptRepository();
    const asaasClient = new FakePayBillClient();
    const service = buildService(transactions, paymentAttempts, asaasClient);

    await expect(
      service.execute({
        householdId: HOUSEHOLD_ID,
        requesterId: REQUESTER_ID,
        transactionId: TRANSACTION_ID,
        identificationField: IDENTIFICATION_FIELD,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(paymentAttempts.createCalls).toHaveLength(0);
    expect(asaasClient.calls).toHaveLength(0);
  });

  it('propagates TransactionNotFoundError without creating a payment attempt', async () => {
    const transactions = new FakeTransactionRepository(new TransactionNotFoundError());
    const paymentAttempts = new FakePaymentAttemptRepository();
    const asaasClient = new FakePayBillClient();
    const service = buildService(transactions, paymentAttempts, asaasClient);

    await expect(
      service.execute({
        householdId: HOUSEHOLD_ID,
        requesterId: REQUESTER_ID,
        transactionId: TRANSACTION_ID,
        identificationField: IDENTIFICATION_FIELD,
      }),
    ).rejects.toBeInstanceOf(TransactionNotFoundError);

    expect(paymentAttempts.createCalls).toHaveLength(0);
  });

  it('propagates TransactionAlreadyPaidError without creating a payment attempt', async () => {
    const transactions = new FakeTransactionRepository(new TransactionAlreadyPaidError());
    const paymentAttempts = new FakePaymentAttemptRepository();
    const asaasClient = new FakePayBillClient();
    const service = buildService(transactions, paymentAttempts, asaasClient);

    await expect(
      service.execute({
        householdId: HOUSEHOLD_ID,
        requesterId: REQUESTER_ID,
        transactionId: TRANSACTION_ID,
        identificationField: IDENTIFICATION_FIELD,
      }),
    ).rejects.toBeInstanceOf(TransactionAlreadyPaidError);

    expect(paymentAttempts.createCalls).toHaveLength(0);
  });

  it('propagates PaymentAttemptAlreadyActiveError without calling Asaas (blocks a second active attempt)', async () => {
    const transactions = new FakeTransactionRepository();
    const paymentAttempts = new FakePaymentAttemptRepository(
      new PaymentAttemptAlreadyActiveError(),
    );
    const asaasClient = new FakePayBillClient();
    const service = buildService(transactions, paymentAttempts, asaasClient);

    await expect(
      service.execute({
        householdId: HOUSEHOLD_ID,
        requesterId: REQUESTER_ID,
        transactionId: TRANSACTION_ID,
        identificationField: IDENTIFICATION_FIELD,
      }),
    ).rejects.toBeInstanceOf(PaymentAttemptAlreadyActiveError);

    expect(asaasClient.calls).toHaveLength(0);
  });

  it('propagates InvalidPaymentAmountError without calling Asaas', async () => {
    const transactions = new FakeTransactionRepository();
    const paymentAttempts = new FakePaymentAttemptRepository(new InvalidPaymentAmountError());
    const asaasClient = new FakePayBillClient();
    const service = buildService(transactions, paymentAttempts, asaasClient);

    await expect(
      service.execute({
        householdId: HOUSEHOLD_ID,
        requesterId: REQUESTER_ID,
        transactionId: TRANSACTION_ID,
        identificationField: IDENTIFICATION_FIELD,
      }),
    ).rejects.toBeInstanceOf(InvalidPaymentAmountError);

    expect(asaasClient.calls).toHaveLength(0);
  });

  describe('when Asaas rejects the request definitively', () => {
    it.each(['invalid_request', 'authentication'] as const)(
      'marks the attempt failed for %s and rethrows',
      async (code) => {
        const transactions = new FakeTransactionRepository();
        const paymentAttempts = new FakePaymentAttemptRepository();
        const asaasClient = new FakePayBillClient(
          new AsaasClientError({ code, message: 'Asaas failure' }),
        );
        const service = buildService(transactions, paymentAttempts, asaasClient);

        await expect(
          service.execute({
            householdId: HOUSEHOLD_ID,
            requesterId: REQUESTER_ID,
            transactionId: TRANSACTION_ID,
            identificationField: IDENTIFICATION_FIELD,
          }),
        ).rejects.toMatchObject({ code });

        expect(paymentAttempts.markFailedCalls).toHaveLength(1);
        expect(paymentAttempts.markFailedCalls[0]?.paymentAttemptId).toBe(PAYMENT_ATTEMPT_ID);
        expect(paymentAttempts.markUncertainCalls).toHaveLength(0);
        expect(paymentAttempts.markProcessingCalls).toHaveLength(0);
      },
    );

    it('never includes the identificationField in the failure reason', async () => {
      const transactions = new FakeTransactionRepository();
      const paymentAttempts = new FakePaymentAttemptRepository();
      const asaasClient = new FakePayBillClient(
        new AsaasClientError({ code: 'invalid_request', message: 'Asaas failure' }),
      );
      const service = buildService(transactions, paymentAttempts, asaasClient);

      await expect(
        service.execute({
          householdId: HOUSEHOLD_ID,
          requesterId: REQUESTER_ID,
          transactionId: TRANSACTION_ID,
          identificationField: IDENTIFICATION_FIELD,
        }),
      ).rejects.toBeInstanceOf(AsaasClientError);

      expect(paymentAttempts.markFailedCalls[0]?.failureReason).not.toContain(IDENTIFICATION_FIELD);
    });
  });

  describe('when the outcome of the Asaas call is uncertain', () => {
    it.each(['unavailable', 'unknown', 'rate_limit'] as const)(
      'marks the attempt uncertain for %s and rethrows, never failed',
      async (code) => {
        const transactions = new FakeTransactionRepository();
        const paymentAttempts = new FakePaymentAttemptRepository();
        const asaasClient = new FakePayBillClient(
          new AsaasClientError({ code, message: 'Asaas timeout' }),
        );
        const service = buildService(transactions, paymentAttempts, asaasClient);

        await expect(
          service.execute({
            householdId: HOUSEHOLD_ID,
            requesterId: REQUESTER_ID,
            transactionId: TRANSACTION_ID,
            identificationField: IDENTIFICATION_FIELD,
          }),
        ).rejects.toMatchObject({ code });

        expect(paymentAttempts.markUncertainCalls).toHaveLength(1);
        expect(paymentAttempts.markUncertainCalls[0]?.paymentAttemptId).toBe(PAYMENT_ATTEMPT_ID);
        expect(paymentAttempts.markFailedCalls).toHaveLength(0);
        expect(paymentAttempts.markProcessingCalls).toHaveLength(0);
      },
    );
  });

  describe('when Asaas accepts the payment but the local write fails', () => {
    it('marks the attempt uncertain preserving the provider resource id, and never retries Asaas', async () => {
      const transactions = new FakeTransactionRepository();
      const persistError = new Error('connection lost while saving processing');
      const paymentAttempts = new FakePaymentAttemptRepository(paymentAttempt(), persistError);
      const asaasClient = new FakePayBillClient(billPayment({ id: 'bill_999' }));
      const service = buildService(transactions, paymentAttempts, asaasClient);

      await expect(
        service.execute({
          householdId: HOUSEHOLD_ID,
          requesterId: REQUESTER_ID,
          transactionId: TRANSACTION_ID,
          identificationField: IDENTIFICATION_FIELD,
        }),
      ).rejects.toBe(persistError);

      // Exactly one POST to Asaas — the local failure must never trigger a second bill payment.
      expect(asaasClient.calls).toHaveLength(1);
      expect(paymentAttempts.markProcessingCalls).toHaveLength(1);
      expect(paymentAttempts.markUncertainCalls).toEqual([
        {
          paymentAttemptId: PAYMENT_ATTEMPT_ID,
          failureReason: expect.any(String),
          providerResourceId: 'bill_999',
        },
      ]);
      expect(paymentAttempts.markFailedCalls).toHaveLength(0);
    });

    it('propagates a safe error and never retries Asaas when markUncertain also fails', async () => {
      const transactions = new FakeTransactionRepository();
      const persistError = new Error('connection lost while saving processing');
      const markUncertainError = new Error('connection still lost');
      const paymentAttempts = new FakePaymentAttemptRepository(
        paymentAttempt(),
        persistError,
        markUncertainError,
      );
      const asaasClient = new FakePayBillClient(billPayment({ id: 'bill_999' }));
      const service = buildService(transactions, paymentAttempts, asaasClient);

      await expect(
        service.execute({
          householdId: HOUSEHOLD_ID,
          requesterId: REQUESTER_ID,
          transactionId: TRANSACTION_ID,
          identificationField: IDENTIFICATION_FIELD,
        }),
      ).rejects.toMatchObject({ cause: markUncertainError });

      // Still exactly one POST to Asaas, even though both local writes failed — the attempt
      // stays 'requested' in storage, which keeps it blocking via the active-attempt index.
      expect(asaasClient.calls).toHaveLength(1);
      expect(paymentAttempts.markProcessingCalls).toHaveLength(1);
      expect(paymentAttempts.markUncertainCalls).toHaveLength(1);
      expect(paymentAttempts.markFailedCalls).toHaveLength(0);
    });
  });
});
