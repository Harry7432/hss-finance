import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBankConnections1789380000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bank_connections" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "household_id" uuid NOT NULL,
        "created_by" uuid NOT NULL,
        "provider" text NOT NULL,
        "provider_connection_id" text NOT NULL,
        "institution_id" text NOT NULL,
        "institution_name" text NOT NULL,
        "status" text NOT NULL,
        "consent_expires_at" timestamptz,
        "last_synced_at" timestamptz,
        "last_sync_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "bank_connections"
        ADD CONSTRAINT "uq_bank_connections_provider_connection"
        UNIQUE ("provider", "provider_connection_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "bank_connections"
        ADD CONSTRAINT "chk_bank_connections_status" CHECK (
          "status" IN ('pending', 'connected', 'error', 'expired', 'disconnected')
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "bank_connections"
        ADD CONSTRAINT "fk_bank_connections_household"
        FOREIGN KEY ("household_id") REFERENCES "households" ("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "bank_connections"
        ADD CONSTRAINT "fk_bank_connections_created_by"
        FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_bank_connections_household" ON "bank_connections" ("household_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_bank_connections_created_by" ON "bank_connections" ("created_by")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bank_connections"`);
  }
}
