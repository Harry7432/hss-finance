import type { MigrationInterface, QueryRunner } from 'typeorm';

// Adds 'uncertain' as a valid PaymentAttempt status: the outcome of a POST /bill call that
// timed out, hit a network error, or returned an unparsable body is genuinely unknown — the
// provider may or may not have created the payment. Treating that as 'failed' would let a
// future retry pay the same bill twice; leaving it as 'requested' would be indistinguishable
// from "never sent to the provider". 'uncertain' stays in the active-attempt set so it keeps
// blocking new attempts until a human reconciles it (out of scope for this slice).
export class AddPaymentAttemptUncertainStatus1789420000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
        DROP CONSTRAINT "chk_payment_attempts_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
        ADD CONSTRAINT "chk_payment_attempts_status" CHECK (
          "status" IN ('requested', 'processing', 'confirmed', 'failed', 'cancelled', 'uncertain')
        )
    `);

    await queryRunner.query(`
      DROP INDEX "uq_payment_attempts_active_per_transaction"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_payment_attempts_active_per_transaction"
      ON "payment_attempts" ("transaction_id")
      WHERE "status" IN ('requested', 'processing', 'uncertain')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "uq_payment_attempts_active_per_transaction"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_payment_attempts_active_per_transaction"
      ON "payment_attempts" ("transaction_id")
      WHERE "status" IN ('requested', 'processing')
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
        DROP CONSTRAINT "chk_payment_attempts_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
        ADD CONSTRAINT "chk_payment_attempts_status" CHECK (
          "status" IN ('requested', 'processing', 'confirmed', 'failed', 'cancelled')
        )
    `);
  }
}
