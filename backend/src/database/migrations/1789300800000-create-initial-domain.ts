import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialDomain1789300800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" text NOT NULL,
        "password_hash" text NOT NULL,
        "name" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "households" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" text NOT NULL,
        "currency_code" char(3) NOT NULL DEFAULT 'BRL',
        "created_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "household_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "household_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" text NOT NULL DEFAULT 'member',
        "joined_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "household_id" uuid NOT NULL,
        "name" text NOT NULL,
        "type" text NOT NULL,
        "color" char(7),
        "icon" text,
        "is_default" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "household_id" uuid NOT NULL,
        "category_id" uuid,
        "created_by" uuid NOT NULL,
        "type" text NOT NULL,
        "amount" numeric(14, 2) NOT NULL,
        "transaction_date" date NOT NULL,
        "due_date" date,
        "paid_at" timestamptz,
        "status" text NOT NULL DEFAULT 'pending',
        "source" text NOT NULL DEFAULT 'manual',
        "external_id" text,
        "description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "uq_users_email" UNIQUE ("email")
    `);

    await queryRunner.query(`
      ALTER TABLE "household_members"
        ADD CONSTRAINT "uq_household_members_household_user" UNIQUE ("household_id", "user_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "categories"
        ADD CONSTRAINT "uq_categories_household_type_name" UNIQUE ("household_id", "type", "name")
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "chk_users_email_length" CHECK (char_length("email") <= 254)
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "chk_users_name_length" CHECK (char_length("name") BETWEEN 1 AND 100)
    `);

    await queryRunner.query(`
      ALTER TABLE "households"
        ADD CONSTRAINT "chk_households_name_length" CHECK (char_length("name") BETWEEN 1 AND 100)
    `);

    await queryRunner.query(`
      ALTER TABLE "households"
        ADD CONSTRAINT "chk_households_currency_code" CHECK ("currency_code" ~ '^[A-Z]{3}$')
    `);

    await queryRunner.query(`
      ALTER TABLE "household_members"
        ADD CONSTRAINT "chk_household_members_role" CHECK ("role" IN ('owner', 'member'))
    `);

    await queryRunner.query(`
      ALTER TABLE "categories"
        ADD CONSTRAINT "chk_categories_type" CHECK ("type" IN ('income', 'expense'))
    `);

    await queryRunner.query(`
      ALTER TABLE "categories"
        ADD CONSTRAINT "chk_categories_color" CHECK ("color" IS NULL OR "color" ~ '^#[0-9A-Fa-f]{6}$')
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_type" CHECK ("type" IN ('income', 'expense'))
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_amount" CHECK ("amount" > 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_status" CHECK ("status" IN ('pending', 'paid'))
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_source" CHECK ("source" IN ('manual', 'bank_import'))
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_status_paid_at" CHECK (("status" = 'paid') = ("paid_at" IS NOT NULL))
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "chk_transactions_description_length" CHECK ("description" IS NULL OR char_length("description") <= 255)
    `);

    await queryRunner.query(`
      ALTER TABLE "households"
        ADD CONSTRAINT "fk_households_created_by"
        FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "household_members"
        ADD CONSTRAINT "fk_household_members_household"
        FOREIGN KEY ("household_id") REFERENCES "households" ("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "household_members"
        ADD CONSTRAINT "fk_household_members_user"
        FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "categories"
        ADD CONSTRAINT "fk_categories_household"
        FOREIGN KEY ("household_id") REFERENCES "households" ("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "fk_transactions_household"
        FOREIGN KEY ("household_id") REFERENCES "households" ("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "fk_transactions_category"
        FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD CONSTRAINT "fk_transactions_created_by"
        FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_household_members_user" ON "household_members" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_transactions_household_date"
      ON "transactions" ("household_id", "transaction_date" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_transactions_household_type_date"
      ON "transactions" ("household_id", "type", "transaction_date" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_transactions_household_category"
      ON "transactions" ("household_id", "category_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_transactions_household_created_by"
      ON "transactions" ("household_id", "created_by")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_transactions_category_id" ON "transactions" ("category_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_households_created_by" ON "households" ("created_by")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "household_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "households"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
