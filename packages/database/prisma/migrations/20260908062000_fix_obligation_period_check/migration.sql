ALTER TABLE "finance"."recurring_obligations"
  DROP CONSTRAINT "recurring_obligations_period_check",
  ADD CONSTRAINT "recurring_obligations_period_check"
  CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "finance"."monthly_budgets"
  DROP CONSTRAINT "monthly_budgets_period_check",
  ADD CONSTRAINT "monthly_budgets_period_check"
  CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
