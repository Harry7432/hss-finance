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
import { TransactionAlreadyPaidError } from '../errors/transaction-already-paid-error.js';
import { TransactionNotFoundError } from '../errors/transaction-not-found-error.js';

const UNIQUE_VIOLATION_CODE = '23505';
const ACTIVE_PAYMENT_ATTEMPT_CONSTRAINT = 'uq_payment_attempts_active_per_transaction';
const ACTIVE_PAYMENT_ATTEMPT_STATUSES: PaymentAttemptStatus[] = ['requested', 'processing'];

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

export interface PaymentAttemptRepository {
  createPaymentAttempt(data: CreatePaymentAttemptData): Promise<PaymentAttemptRecord>;
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
}
