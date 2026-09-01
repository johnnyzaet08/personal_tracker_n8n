-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "automation";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "finance";

-- Reserved domain boundaries. Tables will be added only when those modules are designed.
CREATE SCHEMA IF NOT EXISTS "habits";
CREATE SCHEMA IF NOT EXISTS "health";

-- CreateTable
CREATE TABLE "core"."tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "default_currency" CHAR(3) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(320) NOT NULL,
    "name" VARCHAR(160),
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."tenant_memberships" (
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(32) NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("tenant_id","user_id")
);

-- CreateTable
CREATE TABLE "core"."integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'disconnected',
    "external_account_ref" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "last_sync_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."source_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "external_id" VARCHAR(512) NOT NULL,
    "event_type" VARCHAR(128) NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'received',
    "payload" JSONB NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "source_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "institution_name" VARCHAR(160) NOT NULL,
    "alias" VARCHAR(160) NOT NULL,
    "account_type" VARCHAR(64) NOT NULL,
    "masked_identifier" VARCHAR(32),
    "currency" CHAR(3) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."merchants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "canonical_name" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "color" VARCHAR(16),
    "icon" VARCHAR(64),
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "source_event_id" UUID NOT NULL,
    "account_id" UUID,
    "merchant_id" UUID,
    "category_id" UUID,
    "external_reference" VARCHAR(512),
    "direction" VARCHAR(16) NOT NULL,
    "transaction_type" VARCHAR(64) NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "posted_at" TIMESTAMPTZ(6),
    "confidence" DECIMAL(5,4),
    "requires_review" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "raw_metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."recurring_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "account_id" UUID,
    "merchant_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "expected_amount" DECIMAL(20,4),
    "currency" CHAR(3) NOT NULL,
    "frequency" VARCHAR(32) NOT NULL,
    "next_expected_at" TIMESTAMPTZ(6),
    "last_charged_at" TIMESTAMPTZ(6),
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recurring_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation"."classifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_event_id" UUID NOT NULL,
    "classifier" VARCHAR(128) NOT NULL,
    "classifier_version" VARCHAR(64) NOT NULL,
    "labels" JSONB NOT NULL,
    "confidence" DECIMAL(5,4),
    "decision_reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation"."action_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_event_id" UUID,
    "action_type" VARCHAR(128) NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "error_code" VARCHAR(128),
    "error_message" VARCHAR(1000),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation"."review_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "source_event_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "priority" VARCHAR(16) NOT NULL DEFAULT 'normal',
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "assigned_to" UUID,
    "resolution" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "review_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation"."notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "source_event_id" UUID,
    "channel" VARCHAR(64) NOT NULL,
    "notification_type" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "scheduled_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "core"."tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "core"."users"("email");

-- CreateIndex
CREATE INDEX "tenant_memberships_user_id_idx" ON "core"."tenant_memberships"("user_id");

-- CreateIndex
CREATE INDEX "integrations_tenant_id_status_idx" ON "core"."integrations"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_tenant_id_provider_type_key" ON "core"."integrations"("tenant_id", "provider", "type");

-- CreateIndex
CREATE INDEX "source_events_tenant_id_source_occurred_at_idx" ON "core"."source_events"("tenant_id", "source", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "source_events_tenant_id_status_received_at_idx" ON "core"."source_events"("tenant_id", "status", "received_at" DESC);

-- CreateIndex
CREATE INDEX "source_events_payload_hash_idx" ON "core"."source_events"("payload_hash");

-- CreateIndex
CREATE UNIQUE INDEX "source_events_tenant_id_source_external_id_key" ON "core"."source_events"("tenant_id", "source", "external_id");

-- CreateIndex
CREATE INDEX "accounts_tenant_id_status_idx" ON "finance"."accounts"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenant_id_institution_name_masked_identifier_key" ON "finance"."accounts"("tenant_id", "institution_name", "masked_identifier");

-- CreateIndex
CREATE INDEX "merchants_tenant_id_display_name_idx" ON "finance"."merchants"("tenant_id", "display_name");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_tenant_id_canonical_name_key" ON "finance"."merchants"("tenant_id", "canonical_name");

-- CreateIndex
CREATE INDEX "categories_tenant_id_parent_id_status_idx" ON "finance"."categories"("tenant_id", "parent_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_slug_key" ON "finance"."categories"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_occurred_at_idx" ON "finance"."transactions"("tenant_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_tenant_id_status_occurred_at_idx" ON "finance"."transactions"("tenant_id", "status", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_tenant_id_account_id_occurred_at_idx" ON "finance"."transactions"("tenant_id", "account_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_tenant_id_category_id_occurred_at_idx" ON "finance"."transactions"("tenant_id", "category_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_tenant_id_merchant_id_occurred_at_idx" ON "finance"."transactions"("tenant_id", "merchant_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_tenant_id_currency_occurred_at_idx" ON "finance"."transactions"("tenant_id", "currency", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "transactions_tenant_id_requires_review_occurred_at_idx" ON "finance"."transactions"("tenant_id", "requires_review", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "recurring_payments_tenant_id_status_next_expected_at_idx" ON "finance"."recurring_payments"("tenant_id", "status", "next_expected_at");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_payments_tenant_id_name_account_id_key" ON "finance"."recurring_payments"("tenant_id", "name", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "classifications_source_event_id_classifier_classifier_versi_key" ON "automation"."classifications"("source_event_id", "classifier", "classifier_version");

-- CreateIndex
CREATE UNIQUE INDEX "action_runs_idempotency_key_key" ON "automation"."action_runs"("idempotency_key");

-- CreateIndex
CREATE INDEX "action_runs_source_event_id_status_idx" ON "automation"."action_runs"("source_event_id", "status");

-- CreateIndex
CREATE INDEX "action_runs_status_created_at_idx" ON "automation"."action_runs"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "review_queue_tenant_id_status_priority_created_at_idx" ON "automation"."review_queue"("tenant_id", "status", "priority", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "review_queue_tenant_id_source_event_id_key" ON "automation"."review_queue"("tenant_id", "source_event_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_status_scheduled_at_idx" ON "automation"."notifications"("tenant_id", "status", "scheduled_at");

-- AddForeignKey
ALTER TABLE "core"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."integrations" ADD CONSTRAINT "integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."source_events" ADD CONSTRAINT "source_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."accounts" ADD CONSTRAINT "accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."merchants" ADD CONSTRAINT "merchants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "finance"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "core"."source_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "finance"."merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."recurring_payments" ADD CONSTRAINT "recurring_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."recurring_payments" ADD CONSTRAINT "recurring_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "finance"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."recurring_payments" ADD CONSTRAINT "recurring_payments_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "finance"."merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation"."classifications" ADD CONSTRAINT "classifications_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "core"."source_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation"."action_runs" ADD CONSTRAINT "action_runs_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "core"."source_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation"."review_queue" ADD CONSTRAINT "review_queue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation"."review_queue" ADD CONSTRAINT "review_queue_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "core"."source_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation"."review_queue" ADD CONSTRAINT "review_queue_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "core"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation"."notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation"."notifications" ADD CONSTRAINT "notifications_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "core"."source_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Critical domain invariants that Prisma represents as strings for easier API evolution.
ALTER TABLE "core"."tenants"
  ADD CONSTRAINT "tenants_currency_check" CHECK ("default_currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "tenants_status_check" CHECK ("status" IN ('active', 'suspended', 'disabled'));
ALTER TABLE "core"."users"
  ADD CONSTRAINT "users_email_normalized_check" CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "users_status_check" CHECK ("status" IN ('active', 'invited', 'suspended', 'disabled'));
ALTER TABLE "core"."tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_role_check" CHECK ("role" IN ('owner', 'admin', 'member', 'viewer'));
ALTER TABLE "core"."integrations"
  ADD CONSTRAINT "integrations_status_check" CHECK ("status" IN ('disconnected', 'pending', 'connected', 'error', 'revoked'));
ALTER TABLE "core"."source_events"
  ADD CONSTRAINT "source_events_schema_version_check" CHECK ("schema_version" > 0),
  ADD CONSTRAINT "source_events_status_check" CHECK ("status" IN ('received', 'processing', 'processed', 'duplicate', 'needs_review', 'failed')),
  ADD CONSTRAINT "source_events_payload_hash_check" CHECK ("payload_hash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "finance"."accounts"
  ADD CONSTRAINT "accounts_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "accounts_status_check" CHECK ("status" IN ('active', 'inactive', 'closed'));
ALTER TABLE "finance"."categories"
  ADD CONSTRAINT "categories_type_check" CHECK ("type" IN ('expense', 'income', 'transfer')),
  ADD CONSTRAINT "categories_status_check" CHECK ("status" IN ('active', 'archived'));
ALTER TABLE "finance"."transactions"
  ADD CONSTRAINT "transactions_direction_check" CHECK ("direction" IN ('debit', 'credit')),
  ADD CONSTRAINT "transactions_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "transactions_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "transactions_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
  ADD CONSTRAINT "transactions_status_check" CHECK ("status" IN ('pending', 'posted', 'pending_review', 'void'));
ALTER TABLE "finance"."recurring_payments"
  ADD CONSTRAINT "recurring_payments_amount_check" CHECK ("expected_amount" IS NULL OR "expected_amount" > 0),
  ADD CONSTRAINT "recurring_payments_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "recurring_payments_frequency_check" CHECK ("frequency" IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'irregular')),
  ADD CONSTRAINT "recurring_payments_status_check" CHECK ("status" IN ('active', 'paused', 'ended'));
ALTER TABLE "automation"."classifications"
  ADD CONSTRAINT "classifications_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
ALTER TABLE "automation"."action_runs"
  ADD CONSTRAINT "action_runs_status_check" CHECK ("status" IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  ADD CONSTRAINT "action_runs_attempt_count_check" CHECK ("attempt_count" >= 0),
  ADD CONSTRAINT "action_runs_time_check" CHECK ("completed_at" IS NULL OR "started_at" IS NULL OR "completed_at" >= "started_at");
ALTER TABLE "automation"."review_queue"
  ADD CONSTRAINT "review_queue_priority_check" CHECK ("priority" IN ('low', 'normal', 'high', 'urgent')),
  ADD CONSTRAINT "review_queue_status_check" CHECK ("status" IN ('pending', 'in_review', 'resolved', 'dismissed'));
ALTER TABLE "automation"."notifications"
  ADD CONSTRAINT "notifications_status_check" CHECK ("status" IN ('pending', 'scheduled', 'sent', 'failed', 'cancelled'));

-- Null-safe idempotency for one or many candidate transactions per source event.
CREATE UNIQUE INDEX "transactions_source_event_no_reference_key"
  ON "finance"."transactions" ("tenant_id", "source_event_id")
  WHERE "external_reference" IS NULL;
CREATE UNIQUE INDEX "transactions_source_event_reference_key"
  ON "finance"."transactions" ("tenant_id", "source_event_id", "external_reference")
  WHERE "external_reference" IS NOT NULL;

-- Keep update timestamps correct even for future trusted SQL maintenance jobs.
CREATE OR REPLACE FUNCTION "core"."touch_updated_at"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."updated_at" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "tenants_touch_updated_at" BEFORE UPDATE ON "core"."tenants" FOR EACH ROW EXECUTE FUNCTION "core"."touch_updated_at"();
CREATE TRIGGER "users_touch_updated_at" BEFORE UPDATE ON "core"."users" FOR EACH ROW EXECUTE FUNCTION "core"."touch_updated_at"();
CREATE TRIGGER "integrations_touch_updated_at" BEFORE UPDATE ON "core"."integrations" FOR EACH ROW EXECUTE FUNCTION "core"."touch_updated_at"();
CREATE TRIGGER "source_events_touch_updated_at" BEFORE UPDATE ON "core"."source_events" FOR EACH ROW EXECUTE FUNCTION "core"."touch_updated_at"();
CREATE TRIGGER "accounts_touch_updated_at" BEFORE UPDATE ON "finance"."accounts" FOR EACH ROW EXECUTE FUNCTION "core"."touch_updated_at"();
CREATE TRIGGER "merchants_touch_updated_at" BEFORE UPDATE ON "finance"."merchants" FOR EACH ROW EXECUTE FUNCTION "core"."touch_updated_at"();
CREATE TRIGGER "categories_touch_updated_at" BEFORE UPDATE ON "finance"."categories" FOR EACH ROW EXECUTE FUNCTION "core"."touch_updated_at"();
CREATE TRIGGER "transactions_touch_updated_at" BEFORE UPDATE ON "finance"."transactions" FOR EACH ROW EXECUTE FUNCTION "core"."touch_updated_at"();
CREATE TRIGGER "recurring_payments_touch_updated_at" BEFORE UPDATE ON "finance"."recurring_payments" FOR EACH ROW EXECUTE FUNCTION "core"."touch_updated_at"();
