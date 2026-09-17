import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBankAccounts1789390000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bank_accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "bank_connection_id" uuid NOT NULL,
        "provider_account_id" text NOT NULL,
        "type" text NOT NULL,
        "subtype" text,
        "name" text NOT NULL,
        "currency_code" char(3) NOT NULL,
        "balance" numeric(14, 2),
        "balance_updated_at" timestamptz,
        "masked_number" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "bank_accounts"
        ADD CONSTRAINT "uq_bank_accounts_connection_provider_account"
        UNIQUE ("bank_connection_id", "provider_account_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "bank_accounts"
        ADD CONSTRAINT "chk_bank_accounts_type" CHECK (
          "type" IN ('checking', 'savings', 'credit_card', 'investment', 'other')
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "bank_accounts"
        ADD CONSTRAINT "chk_bank_accounts_currency_code" CHECK ("currency_code" ~ '^[A-Z]{3}$')
    `);

    await queryRunner.query(`
      ALTER TABLE "bank_accounts"
        ADD CONSTRAINT "fk_bank_accounts_bank_connection"
        FOREIGN KEY ("bank_connection_id") REFERENCES "bank_connections" ("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_bank_accounts_bank_connection" ON "bank_accounts" ("bank_connection_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bank_accounts"`);
  }
}
