import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentAttempts1789410000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payment_attempts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "transaction_id" uuid NOT NULL,
        "initiated_by" uuid NOT NULL,
        "kind" text NOT NULL,
        "provider" text NOT NULL DEFAULT 'asaas',
        "provider_resource_id" text,
        -- idempotency_key is generated server-side per attempt; it is NOT the
        -- double-submit guard. The real guards are the pessimistic lock on the
        -- Transaction row and uq_payment_attempts_active_per_transaction below.
        "idempotency_key" text NOT NULL,
        "status" text NOT NULL DEFAULT 'requested',
        "requested_amount" numeric(14, 2) NOT NULL,
        "failure_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "confirmed_at" timestamptz
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
        ADD CONSTRAINT "uq_payment_attempts_idempotency_key" UNIQUE ("idempotency_key")
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
        ADD CONSTRAINT "chk_payment_attempts_kind" CHECK ("kind" IN ('bill', 'pix_transfer'))
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
        ADD CONSTRAINT "chk_payment_attempts_provider" CHECK ("provider" IN ('asaas'))
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
        ADD CONSTRAINT "chk_payment_attempts_status" CHECK (
          "status" IN ('requested', 'processing', 'confirmed', 'failed', 'cancelled')
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
        ADD CONSTRAINT "chk_payment_attempts_requested_amount" CHECK ("requested_amount" > 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
        ADD CONSTRAINT "chk_payment_attempts_confirmed_at" CHECK (
          ("status" = 'confirmed') = ("confirmed_at" IS NOT NULL)
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
        ADD CONSTRAINT "fk_payment_attempts_transaction"
        FOREIGN KEY ("transaction_id") REFERENCES "transactions" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
        ADD CONSTRAINT "fk_payment_attempts_initiated_by"
        FOREIGN KEY ("initiated_by") REFERENCES "users" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_payment_attempts_transaction" ON "payment_attempts" ("transaction_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_payment_attempts_active_per_transaction"
      ON "payment_attempts" ("transaction_id")
      WHERE "status" IN ('requested', 'processing')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_attempts"`);
  }
}
