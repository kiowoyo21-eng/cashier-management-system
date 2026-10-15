-- Hotfix for SQL error 42703: column "cashier_id" does not exist
-- public.cash_incident_reports uses actor_id, not cashier_id.
-- If migration_012 failed, rerun the corrected migration_012_master_revision.sql, then migration_013_role_scope_and_reporting.sql.
-- This file is informational; the actual migrations in this package are already corrected.

-- Correct policy shape:
DROP POLICY IF EXISTS incidents_read ON public.cash_incident_reports;
CREATE POLICY incidents_read ON public.cash_incident_reports FOR SELECT TO authenticated USING(
  private.is_admin()
  OR private.is_hr()
  OR branch_id=private.my_branch()
  OR actor_id=auth.uid()
);
