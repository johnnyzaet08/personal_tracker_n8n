ALTER TABLE "finance"."recurring_obligations"
  ADD COLUMN "due_at_manually_overridden" BOOLEAN NOT NULL DEFAULT false;
