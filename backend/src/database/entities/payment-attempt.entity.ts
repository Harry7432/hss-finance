import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { TransactionEntity } from './transaction.entity.js';
import { UserEntity } from './user.entity.js';

export type PaymentAttemptKind = 'bill' | 'pix_transfer';
export type PaymentAttemptProvider = 'asaas';
export type PaymentAttemptStatus =
  'requested' | 'processing' | 'confirmed' | 'failed' | 'cancelled';

@Entity('payment_attempts')
@Check("\"kind\" IN ('bill', 'pix_transfer')")
@Check('"provider" IN (\'asaas\')')
@Check("\"status\" IN ('requested', 'processing', 'confirmed', 'failed', 'cancelled')")
@Check('"requested_amount" > 0')
@Check('("status" = \'confirmed\') = ("confirmed_at" IS NOT NULL)')
// idempotencyKey is generated server-side per attempt (see repository); it is NOT the
// double-submit guard. The real guards are the pessimistic lock on the Transaction row
// and the uq_payment_attempts_active_per_transaction partial unique index (see migration).
@Unique('uq_payment_attempts_idempotency_key', ['idempotencyKey'])
export class PaymentAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => TransactionEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'transaction_id' })
  transaction!: TransactionEntity;

  @ManyToOne(() => UserEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'initiated_by' })
  initiatedBy!: UserEntity;

  @Column({ type: 'text' })
  kind!: PaymentAttemptKind;

  @Column({ type: 'text', default: 'asaas' })
  provider!: PaymentAttemptProvider;

  @Column({ name: 'provider_resource_id', type: 'text', nullable: true })
  providerResourceId!: string | null;

  @Column({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string;

  @Column({ type: 'text', default: 'requested' })
  status!: PaymentAttemptStatus;

  @Column({ name: 'requested_amount', type: 'numeric', precision: 14, scale: 2 })
  requestedAmount!: string;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;
}
