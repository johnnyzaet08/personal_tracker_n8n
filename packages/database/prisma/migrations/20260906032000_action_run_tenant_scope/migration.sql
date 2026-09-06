BEGIN;
-- New orchestration error records must be directly tenant-scoped.
ALTER TABLE automation.action_runs ADD COLUMN tenant_id UUID;
UPDATE automation.action_runs AS a SET tenant_id = e.tenant_id
FROM core.source_events AS e WHERE e.id = a.source_event_id;
-- The local baseline has a single tenant. Do not guess orphan ownership in multi-tenant databases.
UPDATE automation.action_runs SET tenant_id = (SELECT id FROM core.tenants LIMIT 1)
WHERE tenant_id IS NULL AND (SELECT count(*) FROM core.tenants) = 1;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM automation.action_runs WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'ACTION_RUN_TENANT_MAPPING_REQUIRED';
  END IF;
END $$;
ALTER TABLE automation.action_runs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE automation.action_runs ADD CONSTRAINT action_runs_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES core.tenants(id) ON DELETE RESTRICT;
DROP INDEX automation.action_runs_idempotency_key_key;
CREATE UNIQUE INDEX action_runs_tenant_id_idempotency_key_key
  ON automation.action_runs(tenant_id, idempotency_key);
CREATE INDEX action_runs_tenant_id_status_created_at_idx
  ON automation.action_runs(tenant_id, status, created_at DESC);
CREATE UNIQUE INDEX source_events_tenant_id_id_key ON core.source_events(tenant_id, id);
ALTER TABLE automation.action_runs ADD CONSTRAINT action_runs_tenant_source_event_fkey
  FOREIGN KEY (tenant_id, source_event_id) REFERENCES core.source_events(tenant_id, id)
  ON DELETE SET NULL (source_event_id);
COMMIT;
