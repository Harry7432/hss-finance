import { randomUUID } from 'node:crypto';

import { In } from 'typeorm';
import type { DataSource } from 'typeorm';

import { HouseholdMemberEntity } from '../database/entities/household-member.entity.js';
import type {
  PaymentAttemptKind,
  PaymentAttemptProvider,
  PaymentAttemptStatus,
} from '../database/entities/payment-attempt.entity.js';
import { PaymentAttemptEntity } from '../database/entities/payment-attempt.entity.js';
import { TransactionEntity } from '../database/entities/transaction.entity.js';
import { ForbiddenError } from '../errors/forbidden-error.js';
import { InvalidPaymentAmountError } from '../errors/invalid-payment-amount-error.js';
import { PaymentAttemptAlreadyActiveError } from '../errors/payment-attempt-already-active-error.js';
import { PaymentAttemptInvalidTransitionError } from '../errors/payment-attempt-invalid-transition-error.js';
import { PaymentAttemptNotFoundError } from '../errors/payment-attempt-not-found-error.js';
import { TransactionAlreadyPaidError } from '../errors/transaction-already-paid-error.js';
import { TransactionNotFoundError } from '../errors/transaction-not-found-error.js';

const UNIQUE_VIOLATION_CODE = '23505';
const ACTIVE_PAYMENT_ATTEMPT_CONSTRAINT = 'uq_payment_attempts_active_per_transaction';
// 'uncertain' (outcome unknown after a timeout/unparsable response) must keep blocking new
// attempts just like 'requested'/'processing' — see the migration adding this status for why.
const ACTIVE_PAYMENT_ATTEMPT_STATUSES: PaymentAttemptStatus[] = [
  'requested',
  'processing',
  'uncertain',
];

export interface PaymentAttemptRecord {
  id: string;
  transactionId: string;
  initiatedBy: string;
  kind: PaymentAttemptKind;
  provider: PaymentAttemptProvider;
  providerResourceId: string | null;
  idempotencyKey: string;
  status: PaymentAttemptStatus;
  requestedAmount: string;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
}

export interface CreatePaymentAttemptData {
  householdId: string;
  requesterId: string;
  transactionId: string;
  kind: PaymentAttemptKind;
  requestedAmount: string;
}

export interface MarkPaymentAttemptProcessingData {
  paymentAttemptId: string;
  providerResourceId: string;
}

export interface MarkPaymentAttemptOutcomeData {
  paymentAttemptId: string;
  failureReason: string;
  // Only meaningful for markUncertain: Asaas may have accepted the bill payment (and returned
  // its id) even though we failed to persist that locally as 'processing' — passing it here
  // means we don't lose the one piece of data that could later correlate this attempt to the
  // remote payment. markFailed never receives one: a definite rejection means Asaas never
  // created anything.
  providerResourceId?: string;
}

export interface PaymentAttemptRepository {
  createPaymentAttempt(data: CreatePaymentAttemptData): Promise<PaymentAttemptRecord>;
  // All three transition from 'requested' only (see the state machine in PayBillService);
  // calling any of them on a payment attempt that already moved on throws
  // PaymentAttemptInvalidTransitionError rather than silently overwriting it.
  markProcessing(data: MarkPaymentAttemptProcessingData): Promise<PaymentAttemptRecord>;
  markFailed(data: MarkPaymentAttemptOutcomeData): Promise<PaymentAttemptRecord>;
  markUncertain(data: MarkPaymentAttemptOutcomeData): Promise<PaymentAttemptRecord>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasDriverConstraint(error: unknown, code: string, constraint: string): boolean {
  if (!isRecord(error) || !isRecord(error.driverError)) {
    return false;
  }

  return error.driverError.code === code && error.driverError.constraint === constraint;
}

function normalizeAmount(value: string): string | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);

  if (!match) {
    return null;
  }

  const integer = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(2, '0');

  return `${integer}.${fraction}`;
}

// provider_resource_id is write-once per attempt: once Asaas has told us its id for this
// payment, nothing may silently replace it with a different value. The same id arriving twice
// (e.g. a caller retrying its own local write) is accepted as a no-op.
function assignProviderResourceId(attempt: PaymentAttemptEntity, providerResourceId: string): void {
  if (attempt.providerResourceId !== null && attempt.providerResourceId !== providerResourceId) {
    throw new PaymentAttemptInvalidTransitionError();
  }

  attempt.providerResourceId = providerResourceId;
}

function toPaymentAttemptRecord(entity: PaymentAttemptEntity): PaymentAttemptRecord {
  return {
    id: entity.id,
    transactionId: entity.transaction.id,
    initiatedBy: entity.initiatedBy.id,
    kind: entity.kind,
    provider: entity.provider,
    providerResourceId: entity.providerResourceId,
    idempotencyKey: entity.idempotencyKey,
    status: entity.status,
    requestedAmount: entity.requestedAmount,
    failureReason: entity.failureReason,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    confirmedAt: entity.confirmedAt,
  };
}

export class TypeOrmPaymentAttemptRepository implements PaymentAttemptRepository {
  constructor(private readonly dataSource: DataSource) {}

  async createPaymentAttempt(data: CreatePaymentAttemptData): Promise<PaymentAttemptRecord> {
    return this.dataSource.transaction(async (manager) => {
      const membership = await manager.findOne(HouseholdMemberEntity, {
        select: { id: true, role: true },
        where: {
          household: { id: data.householdId },
          user: { id: data.requesterId },
        },
        lock: { mode: 'pessimistic_read' },
      });

      if (membership?.role !== 'owner') {
        throw new ForbiddenError();
      }

      const transaction = await manager.findOne(TransactionEntity, {
        select: { id: true, status: true, amount: true },
        where: { id: data.transactionId, household: { id: data.householdId } },
        lock: { mode: 'pessimistic_write', tables: ['transactions'] },
      });

      if (!transaction) {
        throw new TransactionNotFoundError();
      }

      if (transaction.status !== 'pending') {
        throw new TransactionAlreadyPaidError();
      }

      const activeAttempt = await manager.findOne(PaymentAttemptEntity, {
        select: { id: true },
        where: {
          transaction: { id: data.transactionId },
          status: In(ACTIVE_PAYMENT_ATTEMPT_STATUSES),
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (activeAttempt) {
        throw new PaymentAttemptAlreadyActiveError();
      }

      const normalizedRequestedAmount = normalizeAmount(data.requestedAmount);
      const normalizedTransactionAmount = normalizeAmount(transaction.amount);

      if (
        normalizedRequestedAmount === null ||
        normalizedRequestedAmount !== normalizedTransactionAmount
      ) {
        throw new InvalidPaymentAmountError();
      }

      const repository = manager.getRepository(PaymentAttemptEntity);
      const paymentAttempt = repository.create({
        transaction: { id: data.transactionId },
        initiatedBy: { id: data.requesterId },
        kind: data.kind,
        provider: 'asaas',
        providerResourceId: null,
        idempotencyKey: randomUUID(),
        status: 'requested',
        requestedAmount: transaction.amount,
        failureReason: null,
        confirmedAt: null,
      });

      try {
        const saved = await repository.save(paymentAttempt);

        return toPaymentAttemptRecord(saved);
      } catch (error: unknown) {
        if (hasDriverConstraint(error, UNIQUE_VIOLATION_CODE, ACTIVE_PAYMENT_ATTEMPT_CONSTRAINT)) {
          throw new PaymentAttemptAlreadyActiveError();
        }

        throw error;
      }
    });
  }

  async markProcessing(data: MarkPaymentAttemptProcessingData): Promise<PaymentAttemptRecord> {
    return this.transitionFromRequested(data.paymentAttemptId, (attempt) => {
      assignProviderResourceId(attempt, data.providerResourceId);
      attempt.status = 'processing';
    });
  }

  async markFailed(data: MarkPaymentAttemptOutcomeData): Promise<PaymentAttemptRecord> {
    return this.transitionFromRequested(data.paymentAttemptId, (attempt) => {
      attempt.status = 'failed';
      attempt.failureReason = data.failureReason;
    });
  }

  // Transitions straight from 'requested' -> 'uncertain', including when the provider's id is
  // already known (Asaas accepted the payment but the local write that would have moved this
  // attempt to 'processing' failed) — there is no intermediate 'processing' -> 'uncertain' hop
  // to model, since that local write never committed.
  async markUncertain(data: MarkPaymentAttemptOutcomeData): Promise<PaymentAttemptRecord> {
    return this.transitionFromRequested(data.paymentAttemptId, (attempt) => {
      if (data.providerResourceId !== undefined) {
        assignProviderResourceId(attempt, data.providerResourceId);
      }

      attempt.status = 'uncertain';
      attempt.failureReason = data.failureReason;
    });
  }

  private async transitionFromRequested(
    paymentAttemptId: string,
    applyPatch: (attempt: PaymentAttemptEntity) => void,
  ): Promise<PaymentAttemptRecord> {
    return this.dataSource.transaction(async (manager) => {
      // tables: ['payment_attempts'] restricts FOR UPDATE to this row only — without it,
      // Postgres locks the joined transaction/user rows too, which can deadlock against
      // createPaymentAttempt's own lock on the transactions row (same fix as
      // TypeOrmTransactionRepository.updateAsMember for the same reason).
      const attempt = await manager.findOne(PaymentAttemptEntity, {
        where: { id: paymentAttemptId },
        relations: { transaction: true, initiatedBy: true },
        lock: { mode: 'pessimistic_write', tables: ['payment_attempts'] },
      });

      if (!attempt) {
        throw new PaymentAttemptNotFoundError();
      }

      if (attempt.status !== 'requested') {
        throw new PaymentAttemptInvalidTransitionError();
      }

      applyPatch(attempt);

      const saved = await manager.getRepository(PaymentAttemptEntity).save(attempt);

      return toPaymentAttemptRecord(saved);
    });
  }
}
