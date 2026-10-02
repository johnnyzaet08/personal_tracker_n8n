ALTER TABLE "finance"."monthly_budgets"
  ALTER COLUMN "income_base" SET DEFAULT 0;

CREATE TABLE "finance"."monthly_incomes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "period" CHAR(7) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "amount" DECIMAL(20,4) NOT NULL,
  "description" VARCHAR(255) NOT NULL,
  "occurred_on" DATE NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "monthly_incomes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "monthly_incomes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "monthly_incomes_period_check" CHECK ("period" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "monthly_incomes_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "monthly_incomes_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "monthly_incomes_description_check" CHECK (length(btrim("description")) > 0),
  CONSTRAINT "monthly_incomes_period_date_check" CHECK (to_char("occurred_on", 'YYYY-MM') = "period")
);

CREATE INDEX "monthly_incomes_tenant_id_period_currency_occurred_on_idx"
  ON "finance"."monthly_incomes"("tenant_id", "period", "currency", "occurred_on" DESC);
