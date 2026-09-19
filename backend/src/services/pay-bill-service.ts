import type {
  AsaasBillPayment,
  AsaasCreateBillPaymentInput,
} from '../integrations/asaas/asaas-client.js';
import { AsaasClientError } from '../integrations/asaas/asaas-client.error.js';
import type { AsaasClientErrorCode } from '../integrations/asaas/asaas-client.error.js';
import type {
  PaymentAttemptKind,
  PaymentAttemptStatus,
} from '../database/entities/payment-attempt.entity.js';
import type {
  PaymentAttemptRecord,
  PaymentAttemptRepository,
} from '../repositories/payment-attempt-repository.js';
import type { TransactionRepository } from '../repositories/transaction-repository.js';

export interface PayBillClient {
  createBillPayment(input: AsaasCreateBillPaymentInput): Promise<AsaasBillPayment>;
}

export interface PayBillInput {
  householdId: string;
  requesterId: string;
  transactionId: string;
  identificationField: string;
}

export interface PayBillResult {
  paymentAttempt: {
    id: string;
    status: PaymentAttemptStatus;
    kind: PaymentAttemptKind;
  };
  provider: {
    status: string;
  };
}

// invalid_request/authentication mean Asaas rejected the request itself before doing anything
// with it — safe to treat as a definitive failure. rate_limit, unavailable (network error,
// timeout, 5xx) and unknown (a 2xx we couldn't parse) all mean we genuinely don't know whether
// Asaas created the payment, so none of them may be marked failed (a future retry could then
// pay the same bill twice): Asaas does not document that a 429 on a mutating endpoint like
// POST /bill is guaranteed to precede any processing, so rate_limit gets the same conservative
// treatment as a timeout — see the migration that added the 'uncertain' status for the full
// reasoning.
function isDefiniteRejection(code: AsaasClientErrorCode): boolean {
  return code === 'invalid_request' || code === 'authentication';
}

function failureReasonFor(code: AsaasClientErrorCode): string {
  return `Asaas bill payment request failed with provider error code: ${code}`;
}

// Asaas has already accepted the bill payment (billPayment.id exists) at this point — a
// failure here is a local persistence problem, not a provider rejection, so we must never
// retry the POST and must never lose the provider id if we still have it in hand.
const LOCAL_PERSISTENCE_FAILURE_REASON =
  'Asaas accepted the bill payment but the local attempt could not be persisted as processing';

export class PayBillService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly paymentAttempts: PaymentAttemptRepository,
    private readonly asaasClient: PayBillClient,
  ) {}

  async execute(input: PayBillInput): Promise<PayBillResult> {
    const transaction = await this.transactions.findPendingAsOwner({
      householdId: input.householdId,
      requesterId: input.requesterId,
      transactionId: input.transactionId,
    });

    const attempt = await this.paymentAttempts.createPaymentAttempt({
      householdId: input.householdId,
      requesterId: input.requesterId,
      transactionId: input.transactionId,
      kind: 'bill',
      requestedAmount: transaction.amount,
    });

    let billPayment: AsaasBillPayment;

    try {
      billPayment = await this.asaasClient.createBillPayment({
        identificationField: input.identificationField,
        // The attempt's own id is stable, exists before this call, contains no PII and no
        // digitable line, and doesn't depend on provider_resource_id (which doesn't exist yet)
        // — it's what lets us reconcile this payment later if we never learn Asaas's id for it.
        externalReference: attempt.id,
      });
    } catch (error: unknown) {
      if (error instanceof AsaasClientError) {
        const failureReason = failureReasonFor(error.code);

        if (isDefiniteRejection(error.code)) {
          await this.paymentAttempts.markFailed({
            paymentAttemptId: attempt.id,
            failureReason,
          });
        } else {
          await this.paymentAttempts.markUncertain({
            paymentAttemptId: attempt.id,
            failureReason,
          });
        }
      }

      throw error;
    }

    let updated: PaymentAttemptRecord;

    try {
      updated = await this.paymentAttempts.markProcessing({
        paymentAttemptId: attempt.id,
        providerResourceId: billPayment.id,
      });
    } catch (persistError: unknown) {
      // Asaas already created the payment (billPayment.id exists) — do not retry the POST.
      // Record what we know as 'uncertain' so the attempt stays blocking and the provider id
      // (plus externalReference = attempt.id, already sent to Asaas) survives for reconciliation.
      try {
        await this.paymentAttempts.markUncertain({
          paymentAttemptId: attempt.id,
          failureReason: LOCAL_PERSISTENCE_FAILURE_REASON,
          providerResourceId: billPayment.id,
        });
      } catch (markUncertainError: unknown) {
        // Both local writes failed. There's no safe corrective action beyond propagating the
        // failure: the attempt is still 'requested', which keeps blocking new attempts via the
        // active-attempt index, and externalReference = attempt.id is already on the Asaas side
        // for a human to reconcile manually.
        throw new Error(
          'Asaas accepted the bill payment but the outcome could not be recorded locally, ' +
            'not even as uncertain; the attempt remains requested and blocking, and must be ' +
            'reconciled manually against Asaas using externalReference = PaymentAttempt.id',
          { cause: markUncertainError },
        );
      }

      throw persistError;
    }

    return {
      paymentAttempt: {
        id: updated.id,
        status: updated.status,
        kind: updated.kind,
      },
      provider: {
        status: billPayment.status,
      },
    };
  }
}
