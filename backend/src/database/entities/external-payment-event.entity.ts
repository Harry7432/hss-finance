import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import { PaymentAttemptEntity } from './payment-attempt.entity.js';

export type ExternalPaymentEventProvider = 'asaas';

@Entity('external_payment_events')
@Check('"provider" IN (\'asaas\')')
@Unique('uq_external_payment_events_provider_event_id', ['providerEventId'])
export class ExternalPaymentEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', default: 'asaas' })
  provider!: ExternalPaymentEventProvider;

  // The provider's own event id (Asaas `id`), not the bill/resource id. This is the sole
  // idempotency key: Asaas guarantees at-least-once delivery, so the same event id may arrive
  // more than once and must never be applied twice (see AsaasWebhookRepository).
  @Column({ name: 'provider_event_id', type: 'text' })
  providerEventId!: string;

  @Column({ name: 'event_type', type: 'text' })
  eventType!: string;

  @Column({ name: 'provider_resource_id', type: 'text', nullable: true })
  providerResourceId!: string | null;

  // Null when this event could not be correlated to any known PaymentAttempt — see
  // AsaasWebhookRepository for the correlation strategy and processedAt semantics.
  @ManyToOne(() => PaymentAttemptEntity, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'payment_attempt_id' })
  paymentAttempt!: PaymentAttemptEntity | null;

  // Sanitized subset of the provider payload — never the raw body. See
  // sanitizeAsaasBillWebhookPayload: excludes identificationField and other fields with no
  // reconciliation/audit value, to avoid persisting more than necessary.
  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  // Null means "needs manual reconciliation": no correlation was found, the event is
  // BILL_REFUNDED, the event type is unrecognized, or the state machine rejected the
  // transition as invalid/out-of-order (fail-closed). Non-null means the event was fully
  // auto-handled (including a deliberate no-op) and needs no further attention.
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
}
