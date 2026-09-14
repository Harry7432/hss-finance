import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionExpenseNature1789360000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD COLUMN "expense_nature" text
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_expense_nature" CHECK (
          "expense_nature" IS NULL
          OR (
            "type" = 'expense'
            AND "expense_nature" IN ('fixed', 'variable')
          )
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP CONSTRAINT "chk_transactions_expense_nature"
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP COLUMN "expense_nature"
    `);
  }
}
