import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecurringTransactions1789370000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "recurring_transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "household_id" uuid NOT NULL,
        "category_id" uuid,
        "created_by" uuid NOT NULL,
        "type" text NOT NULL,
        "amount" numeric(14, 2) NOT NULL,
        "expense_nature" text,
        "description" text,
        "day_of_month" smallint NOT NULL,
        "frequency" text NOT NULL DEFAULT 'monthly',
        "is_active" boolean NOT NULL DEFAULT true,
        "start_date" date NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "recurring_transactions"
        ADD CONSTRAINT "chk_recurring_transactions_type" CHECK ("type" IN ('income', 'expense'))
    `);

    await queryRunner.query(`
      ALTER TABLE "recurring_transactions"
        ADD CONSTRAINT "chk_recurring_transactions_amount" CHECK ("amount" > 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "recurring_transactions"
        ADD CONSTRAINT "chk_recurring_transactions_expense_nature" CHECK (
          "expense_nature" IS NULL
          OR (
            "type" = 'expense'
            AND "expense_nature" IN ('fixed', 'variable')
          )
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "recurring_transactions"
        ADD CONSTRAINT "chk_recurring_transactions_day_of_month" CHECK ("day_of_month" BETWEEN 1 AND 31)
    `);

    await queryRunner.query(`
      ALTER TABLE "recurring_transactions"
        ADD CONSTRAINT "chk_recurring_transactions_frequency" CHECK ("frequency" IN ('monthly'))
    `);

    await queryRunner.query(`
      ALTER TABLE "recurring_transactions"
        ADD CONSTRAINT "chk_recurring_transactions_description_length" CHECK ("description" IS NULL OR char_length("description") <= 255)
    `);

    await queryRunner.query(`
      ALTER TABLE "recurring_transactions"
        ADD CONSTRAINT "fk_recurring_transactions_household"
        FOREIGN KEY ("household_id") REFERENCES "households" ("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "recurring_transactions"
        ADD CONSTRAINT "fk_recurring_transactions_category"
        FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "recurring_transactions"
        ADD CONSTRAINT "fk_recurring_transactions_created_by"
        FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_recurring_transactions_household" ON "recurring_transactions" ("household_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_recurring_transactions_household_active"
      ON "recurring_transactions" ("household_id", "is_active")
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD COLUMN "recurring_transaction_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD COLUMN "recurring_period" date
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "fk_transactions_recurring_transaction"
        FOREIGN KEY ("recurring_transaction_id") REFERENCES "recurring_transactions" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP CONSTRAINT "chk_transactions_source"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_source" CHECK ("source" IN ('manual', 'bank_import', 'recurring'))
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_recurring_coherence" CHECK (
          ("recurring_transaction_id" IS NULL) = ("recurring_period" IS NULL)
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_source_recurring_coherence" CHECK (
          ("source" = 'recurring') = ("recurring_transaction_id" IS NOT NULL)
        )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_transactions_recurring_transaction_period"
      ON "transactions" ("recurring_transaction_id", "recurring_period")
      WHERE "recurring_transaction_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "uq_transactions_recurring_transaction_period"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP CONSTRAINT "chk_transactions_source_recurring_coherence"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP CONSTRAINT "chk_transactions_recurring_coherence"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP CONSTRAINT "chk_transactions_source"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_source" CHECK ("source" IN ('manual', 'bank_import'))
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP CONSTRAINT "fk_transactions_recurring_transaction"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP COLUMN "recurring_period"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP COLUMN "recurring_transaction_id"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "recurring_transactions"`);
  }
}
