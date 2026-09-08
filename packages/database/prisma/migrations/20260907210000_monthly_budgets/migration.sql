ALTER TABLE "finance"."categories"
  ADD COLUMN "budget_group" VARCHAR(32);

ALTER TABLE "finance"."categories"
  ADD CONSTRAINT "categories_budget_group_check"
  CHECK ("budget_group" IS NULL OR "budget_group" IN ('savings', 'needs', 'provisions', 'play'));

CREATE TABLE "finance"."monthly_budgets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "period" CHAR(7) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "income_base" DECIMAL(20,4) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "monthly_budgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "monthly_budgets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "monthly_budgets_period_check" CHECK ("period" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "monthly_budgets_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "monthly_budgets_income_base_check" CHECK ("income_base" >= 0),
  CONSTRAINT "monthly_budgets_tenant_id_period_currency_key" UNIQUE ("tenant_id", "period", "currency")
);

CREATE INDEX "monthly_budgets_tenant_id_period_idx" ON "finance"."monthly_budgets"("tenant_id", "period");

CREATE TABLE "finance"."budget_allocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "budget_id" UUID NOT NULL,
  "group_key" VARCHAR(32) NOT NULL,
  "percentage" DECIMAL(7,4) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "budget_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "budget_allocations_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "finance"."monthly_budgets"("id") ON DELETE CASCADE,
  CONSTRAINT "budget_allocations_group_key_check" CHECK ("group_key" IN ('savings', 'needs', 'provisions', 'play')),
  CONSTRAINT "budget_allocations_percentage_check" CHECK ("percentage" >= 0 AND "percentage" <= 100),
  CONSTRAINT "budget_allocations_budget_id_group_key_key" UNIQUE ("budget_id", "group_key")
);
