import type { MigrationInterface, QueryRunner } from 'typeorm';

// Slice F: webhook reconciliation for Pague Contas. ExternalPaymentEvent is the idempotency
// ledger for inbound Asaas webhooks (at-least-once delivery — see AsaasWebhookRepository).
//
// This migration also adds a partial UNIQUE index on payment_attempts.provider_resource_id.
// The whole webhook correlation strategy (bill.id -> PaymentAttempt) depends on that column
// uniquely identifying at most one attempt; without a DB constraint, a bug or race could let
// two attempts share a provider_resource_id and silently misroute a BILL_PAID confirmation to
// the wrong Transaction. NULLs are excluded (an attempt has no provider_resource_id until
// Asaas accepts it).
export class CreateExternalPaymentEvents1789430000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_payment_attempts_provider_resource_id"
      ON "payment_attempts" ("provider_resource_id")
      WHERE "provider_resource_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "external_payment_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "provider" text NOT NULL DEFAULT 'asaas',
        "provider_event_id" text NOT NULL,
        "event_type" text NOT NULL,
        "provider_resource_id" text,
        "payment_attempt_id" uuid,
        "raw_payload" jsonb NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        "processed_at" timestamptz
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "external_payment_events"
        ADD CONSTRAINT "uq_external_payment_events_provider_event_id" UNIQUE ("provider_event_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "external_payment_events"
        ADD CONSTRAINT "chk_external_payment_events_provider" CHECK ("provider" IN ('asaas'))
    `);

    await queryRunner.query(`
      ALTER TABLE "external_payment_events"
        ADD CONSTRAINT "fk_external_payment_events_payment_attempt"
        FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_external_payment_events_payment_attempt"
      ON "external_payment_events" ("payment_attempt_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_external_payment_events_provider_resource_id"
      ON "external_payment_events" ("provider_resource_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_external_payment_events_unprocessed"
      ON "external_payment_events" ("received_at")
      WHERE "processed_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "external_payment_events"`);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_payment_attempts_provider_resource_id"
    `);
  }
}
