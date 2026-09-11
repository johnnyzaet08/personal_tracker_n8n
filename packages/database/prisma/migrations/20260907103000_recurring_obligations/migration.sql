ALTER TABLE "finance"."recurring_payments"
  ADD COLUMN "category_id" UUID,
  ADD COLUMN "start_at" TIMESTAMPTZ(6),
  ADD COLUMN "due_day" INTEGER,
  ADD COLUMN "aliases" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "paused_at" TIMESTAMPTZ(6);

UPDATE "finance"."recurring_payments"
SET "start_at" = COALESCE("next_expected_at", "created_at")
WHERE "start_at" IS NULL;

ALTER TABLE "finance"."recurring_payments"
  ALTER COLUMN "start_at" SET NOT NULL,
  ADD CONSTRAINT "recurring_payments_due_day_check" CHECK ("due_day" IS NULL OR "due_day" BETWEEN 1 AND 31),
  ADD CONSTRAINT "recurring_payments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance"."categories"("id") ON DELETE SET NULL;

CREATE INDEX "recurring_payments_tenant_id_category_id_idx" ON "finance"."recurring_payments"("tenant_id", "category_id");

CREATE TABLE "finance"."recurring_obligations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "recurring_payment_id" UUID NOT NULL,
  "transaction_id" UUID,
  "period" CHAR(7) NOT NULL,
  "expected_amount" DECIMAL(20,4) NOT NULL,
  "actual_amount" DECIMAL(20,4),
  "currency" CHAR(3) NOT NULL,
  "category_id" UUID,
  "due_at" TIMESTAMPTZ(6) NOT NULL,
  "paid_at" TIMESTAMPTZ(6),
  "payment_status" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "reconciliation_status" VARCHAR(32) NOT NULL DEFAULT 'unreconciled',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "recurring_obligations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recurring_obligations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "recurring_obligations_recurring_payment_id_fkey" FOREIGN KEY ("recurring_payment_id") REFERENCES "finance"."recurring_payments"("id") ON DELETE CASCADE,
  CONSTRAINT "recurring_obligations_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "finance"."transactions"("id") ON DELETE SET NULL,
  CONSTRAINT "recurring_obligations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance"."categories"("id") ON DELETE SET NULL,
  CONSTRAINT "recurring_obligations_period_check" CHECK ("period" ~ '^\\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "recurring_obligations_payment_status_check" CHECK ("payment_status" IN ('pending', 'paid', 'cancelled')),
  CONSTRAINT "recurring_obligations_reconciliation_status_check" CHECK ("reconciliation_status" IN ('unreconciled', 'manual', 'reconciled', 'review')),
  CONSTRAINT "recurring_obligations_tenant_id_recurring_payment_id_period_key" UNIQUE ("tenant_id", "recurring_payment_id", "period"),
  CONSTRAINT "recurring_obligations_transaction_id_key" UNIQUE ("transaction_id")
);

CREATE INDEX "recurring_obligations_tenant_id_period_currency_payment_status_idx" ON "finance"."recurring_obligations"("tenant_id", "period", "currency", "payment_status");
