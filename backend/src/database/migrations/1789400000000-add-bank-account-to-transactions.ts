import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankAccountToTransactions1789400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD COLUMN "bank_account_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD COLUMN "original_description" text
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "fk_transactions_bank_account"
        FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_source_bank_import_coherence" CHECK (
          ("source" = 'bank_import') = ("bank_account_id" IS NOT NULL)
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_original_description_length" CHECK (
          "original_description" IS NULL OR char_length("original_description") <= 255
        )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_transactions_bank_account_external_id"
      ON "transactions" ("bank_account_id", "external_id")
      WHERE "bank_account_id" IS NOT NULL AND "external_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "uq_transactions_bank_account_external_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP CONSTRAINT "chk_transactions_original_description_length"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP CONSTRAINT "chk_transactions_source_bank_import_coherence"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP CONSTRAINT "fk_transactions_bank_account"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP COLUMN "original_description"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP COLUMN "bank_account_id"
    `);
  }
}
