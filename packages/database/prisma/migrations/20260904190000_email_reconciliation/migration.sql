-- AlterTable
ALTER TABLE "finance"."transactions" ADD COLUMN     "financial_hash" CHAR(64),
ADD COLUMN     "manually_modified_at" TIMESTAMPTZ(6),
ADD COLUMN     "reconciliation_key" VARCHAR(64);

-- CreateTable
CREATE TABLE "core"."email_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "sender_address" VARCHAR(320) NOT NULL,
    "institution_name" VARCHAR(160) NOT NULL,
    "adapter_key" VARCHAR(128) NOT NULL,
    "account_id" UUID,
    "default_currency" CHAR(3),
    "auto_ingestion_enabled" BOOLEAN NOT NULL DEFAULT false,
    "manual_sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "last_sync_at" TIMESTAMPTZ(6),
    "last_result" VARCHAR(64),
    "last_error_code" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."email_sync_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "correlation_id" VARCHAR(128) NOT NULL,
    "period_mode" VARCHAR(16) NOT NULL,
    "period_month" CHAR(7) NOT NULL,
    "exact_date" CHAR(10),
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "result" JSONB NOT NULL DEFAULT '{}',
    "last_error_code" VARCHAR(64),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "email_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."email_sync_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "message_id" VARCHAR(512) NOT NULL,
    "thread_id" VARCHAR(512),
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "classification" VARCHAR(32) NOT NULL,
    "eligible" BOOLEAN NOT NULL DEFAULT false,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "candidate" JSONB,
    "reason_codes" JSONB NOT NULL DEFAULT '[]',
    "processing_result" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_sync_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_sources_tenant_id_status_idx" ON "core"."email_sources"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "email_sources_tenant_id_integration_id_sender_address_key" ON "core"."email_sources"("tenant_id", "integration_id", "sender_address");

-- CreateIndex
CREATE UNIQUE INDEX "email_sources_tenant_id_id_key" ON "core"."email_sources"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "email_sync_runs_tenant_id_source_id_created_at_idx" ON "core"."email_sync_runs"("tenant_id", "source_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "email_sync_runs_tenant_id_idempotency_key_key" ON "core"."email_sync_runs"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "email_sync_runs_tenant_id_id_key" ON "core"."email_sync_runs"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "email_sync_runs_tenant_id_id_source_id_key" ON "core"."email_sync_runs"("tenant_id", "id", "source_id");

-- CreateIndex
CREATE INDEX "email_sync_candidates_tenant_id_run_id_selected_idx" ON "core"."email_sync_candidates"("tenant_id", "run_id", "selected");

-- CreateIndex
CREATE UNIQUE INDEX "email_sync_candidates_tenant_id_run_id_message_id_key" ON "core"."email_sync_candidates"("tenant_id", "run_id", "message_id");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_tenant_id_id_key" ON "core"."integrations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tenant_id_id_key" ON "finance"."accounts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_tenant_id_reconciliation_key_key" ON "finance"."transactions"("tenant_id", "reconciliation_key");

-- New connector entities are explicitly tenant-scoped, including related resources.
ALTER TABLE core.email_sources
  ADD CONSTRAINT email_sources_tenant_fk FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE,
  ADD CONSTRAINT email_sources_integration_tenant_fk FOREIGN KEY (tenant_id,integration_id) REFERENCES core.integrations(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT email_sources_account_tenant_fk FOREIGN KEY (tenant_id,account_id) REFERENCES finance.accounts(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT email_sources_sender_check CHECK (sender_address = lower(btrim(sender_address)) AND sender_address ~ '^[^[:space:]@]+@[^[:space:]@]+$'),
  ADD CONSTRAINT email_sources_status_check CHECK (status IN ('active','disabled')),
  ADD CONSTRAINT email_sources_currency_check CHECK (default_currency IS NULL OR default_currency ~ '^[A-Z]{3}$');
ALTER TABLE core.email_sync_runs
  ADD CONSTRAINT email_sync_runs_tenant_fk FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE,
  ADD CONSTRAINT email_sync_runs_source_tenant_fk FOREIGN KEY (tenant_id,source_id) REFERENCES core.email_sources(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT email_sync_runs_status_check CHECK (status IN ('pending','fetching','awaiting_selection','processing','completed','partially_completed','failed','cancelled')),
  ADD CONSTRAINT email_sync_runs_period_check CHECK ((period_mode = 'current_month' AND exact_date IS NULL) OR (period_mode = 'exact_date' AND exact_date IS NOT NULL AND left(exact_date,7)=period_month)),
  ADD CONSTRAINT email_sync_runs_month_check CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT email_sync_runs_time_check CHECK (expires_at >= created_at AND (completed_at IS NULL OR completed_at >= created_at));
ALTER TABLE core.email_sync_candidates
  ADD CONSTRAINT email_sync_candidates_tenant_fk FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE CASCADE,
  ADD CONSTRAINT email_sync_candidates_run_source_tenant_fk FOREIGN KEY (tenant_id,run_id,source_id) REFERENCES core.email_sync_runs(tenant_id,id,source_id) ON DELETE CASCADE,
  ADD CONSTRAINT email_sync_candidates_hash_check CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT email_sync_candidates_classification_check CHECK (classification IN ('new','exact_duplicate','already_processed','conflict','requires_review','ignored_outside_period','invalid')),
  ADD CONSTRAINT email_sync_candidates_selection_check CHECK (NOT selected OR eligible);
CREATE UNIQUE INDEX email_sync_runs_active_source_key ON core.email_sync_runs(tenant_id,source_id)
  WHERE status IN ('pending','fetching','awaiting_selection','processing');
ALTER TABLE finance.transactions
  ADD CONSTRAINT transactions_reconciliation_hash_check CHECK (reconciliation_key IS NULL OR reconciliation_key ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT transactions_financial_hash_check CHECK (financial_hash IS NULL OR financial_hash ~ '^[a-f0-9]{64}$');
CREATE TRIGGER email_sources_touch_updated_at BEFORE UPDATE ON core.email_sources FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();
CREATE TRIGGER email_sync_runs_touch_updated_at BEFORE UPDATE ON core.email_sync_runs FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();
CREATE TRIGGER email_sync_candidates_touch_updated_at BEFORE UPDATE ON core.email_sync_candidates FOR EACH ROW EXECUTE FUNCTION core.touch_updated_at();
