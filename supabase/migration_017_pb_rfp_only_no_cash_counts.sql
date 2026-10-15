-- CMS v17: PB is RFP-only with no daily cash-count / incident / handover workflow.
-- Run AFTER migration_016_rfp_disbursement_and_pb_dashboard.sql.
-- PB responsibilities: Record RFP Expense + Prepare RFP Disbursement/Replenishment.
-- Only Sales uses turnover. RFP has no Opening Cash Count, Closing Cash Count,
-- generic cash-count Incident Report, or RFP Handover task.
BEGIN;

-- ---------------------------------------------------------------------------
-- Daily cash counts: RFP does not use BOD/EOD. Historical rows remain intact.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.daily_count_workflow_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE v_role text;
BEGIN
 SELECT role INTO v_role
 FROM public.profiles
 WHERE id=auth.uid() AND is_active=true;

 IF NEW.cash_account='Funds' THEN
  RAISE EXCEPTION 'RFP does not use Opening or Closing Cash Count';
 END IF;

 IF v_role='PB' THEN
  RAISE EXCEPTION 'PB does not use daily cash-count tasks';
 END IF;

 IF v_role='Cashier' AND NEW.cash_account='Sales' AND NEW.count_type='EOD' THEN
  RAISE EXCEPTION 'Sales uses Sales Turnover instead of a standalone Closing Cash Count';
 END IF;

 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.daily_count_workflow_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.daily_count_workflow_guard() TO authenticated;

DROP TRIGGER IF EXISTS daily_count_workflow_guard ON public.daily_cash_counts;
CREATE TRIGGER daily_count_workflow_guard
BEFORE INSERT OR UPDATE ON public.daily_cash_counts
FOR EACH ROW EXECUTE FUNCTION private.daily_count_workflow_guard();

-- ---------------------------------------------------------------------------
-- Fund activity gate: Revolving Fund keeps daily cash-count controls.
-- RFP does NOT require Opening/Closing Cash Count before expense/disbursement work.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.require_opening_cash_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
 v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;
 v_clock time:=(now() AT TIME ZONE 'Asia/Manila')::time;
 v_role text;
 v_release boolean:=coalesce(current_setting('app.rfp_release',true),'')='1';
BEGIN
 IF v_release THEN RETURN NEW; END IF;

 SELECT role INTO v_role
 FROM public.profiles
 WHERE id=auth.uid() AND is_active=true;

 IF NEW.account='Funds' THEN
  IF v_role NOT IN ('PB','Admin','Branch Manager','Super Admin') THEN
   RAISE EXCEPTION 'RFP activity is restricted to PB or authorized management';
  END IF;
  -- RFP is controlled by expense + disbursement/replenishment workflow,
  -- not by daily Opening/Closing Cash Count.
  RETURN NEW;
 END IF;

 IF NEW.account='Petty Cash' THEN
  IF v_role NOT IN ('Cashier','Admin','Branch Manager','Super Admin') THEN
   RAISE EXCEPTION 'Revolving Fund activity is restricted to Cashier or authorized management';
  END IF;

  IF NOT EXISTS(
   SELECT 1 FROM public.daily_cash_counts c
   WHERE c.branch_id=NEW.branch_id
     AND c.cash_account='Petty Cash'
     AND c.count_type='BOD'
     AND c.business_date=v_day
  ) THEN
   RAISE EXCEPTION 'Complete today''s Revolving Fund Opening Cash Count before posting fund activity';
  END IF;

  IF v_clock>=time '17:00' AND NOT EXISTS(
   SELECT 1 FROM public.daily_cash_counts c
   WHERE c.branch_id=NEW.branch_id
     AND c.cash_account='Petty Cash'
     AND c.count_type='EOD'
     AND c.business_date=v_day
  ) THEN
   RAISE EXCEPTION 'Complete today''s Revolving Fund Closing Cash Count before continuing fund activity';
  END IF;

  IF EXISTS(
   SELECT 1 FROM public.daily_cash_counts c
   WHERE c.branch_id=NEW.branch_id
     AND c.cash_account='Petty Cash'
     AND c.count_type='EOD'
     AND c.business_date=v_day
  ) THEN
   RAISE EXCEPTION 'Today''s Revolving Fund Closing Cash Count is already complete. Await the next Opening Cash Count';
  END IF;
 END IF;

 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.require_opening_cash_count() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.require_opening_cash_count() TO authenticated;

-- ---------------------------------------------------------------------------
-- PB/RFP has no generic cash-count Incident Report.
-- This guards inserts even if an old client still calls submit_cash_incident().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.cash_incident_role_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE v_role text;
BEGIN
 SELECT role INTO v_role
 FROM public.profiles
 WHERE id=auth.uid() AND is_active=true;

 IF NEW.cash_account='Funds' THEN
  RAISE EXCEPTION 'RFP does not use cash-count Incident Reports';
 END IF;

 IF v_role='PB' THEN
  RAISE EXCEPTION 'PB does not submit cash-count Incident Reports';
 END IF;

 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.cash_incident_role_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.cash_incident_role_guard() TO authenticated;

DROP TRIGGER IF EXISTS cash_incident_role_guard ON public.cash_incident_reports;
CREATE TRIGGER cash_incident_role_guard
BEFORE INSERT ON public.cash_incident_reports
FOR EACH ROW EXECUTE FUNCTION private.cash_incident_role_guard();

-- ---------------------------------------------------------------------------
-- Only Sales has Turnover. Retire the legacy RFP handover RPC.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.submit_fund_turnover(numeric,text,text) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Transaction numbering: PB may create only RFP expense and disbursement request IDs.
-- RFP replenishment IDs are generated by authorized management during release.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_transaction_number(p_prefix text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_prefix text:=upper(regexp_replace(trim(coalesce(p_prefix,'')),'[^A-Z0-9-]','','g'));
 v_year integer:=extract(year FROM (now() AT TIME ZONE 'Asia/Manila'))::integer;
 v_next bigint;
 v_role text;
BEGIN
 PERFORM private.assert_active();
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();

 IF v_prefix NOT IN ('POS','RF-EXP','RF-REP','RFP-EXP','RFP-REP','RFP-DR','CC','OCC','CCC','SALES-HO') THEN
  RAISE EXCEPTION 'Invalid transaction prefix';
 END IF;

 IF v_role='Cashier' AND v_prefix NOT IN ('POS','RF-EXP','RF-REP','CC','OCC','CCC','SALES-HO') THEN
  RAISE EXCEPTION 'Cashier transaction number not allowed for this workflow';
 END IF;

 IF v_role='PB' AND v_prefix NOT IN ('RFP-EXP','RFP-DR') THEN
  RAISE EXCEPTION 'PB transaction number not allowed for this workflow';
 END IF;

 IF v_role='HR' THEN
  RAISE EXCEPTION 'HR reporting access cannot create operational transactions';
 END IF;

 INSERT INTO public.transaction_sequences(prefix,year,last_value)
 VALUES(v_prefix,v_year,1)
 ON CONFLICT(prefix,year)
 DO UPDATE SET last_value=public.transaction_sequences.last_value+1
 RETURNING last_value INTO v_next;

 RETURN v_prefix||'-'||v_year::text||'-'||lpad(v_next::text,6,'0');
END $$;

REVOKE ALL ON FUNCTION public.next_transaction_number(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.next_transaction_number(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Read policies: PB no longer needs daily cash-count / incident / handover records.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS counts_read ON public.daily_cash_counts;
CREATE POLICY counts_read
ON public.daily_cash_counts
FOR SELECT TO authenticated
USING(
 private.is_admin()
 OR private.is_hr()
 OR (private.my_role()='Branch Manager' AND branch_id=private.my_branch())
 OR (private.my_role()='Cashier' AND branch_id=private.my_branch() AND cash_account IN ('Sales','Petty Cash'))
);

DROP POLICY IF EXISTS incidents_read ON public.cash_incident_reports;
CREATE POLICY incidents_read
ON public.cash_incident_reports
FOR SELECT TO authenticated
USING(
 private.is_admin()
 OR private.is_hr()
 OR (private.my_role()='Branch Manager' AND branch_id=private.my_branch())
 OR (
   actor_id=auth.uid()
   AND private.my_role()='Cashier'
   AND cash_account IN ('Sales','Petty Cash')
 )
);

DROP POLICY IF EXISTS rfp_handover_read ON public.fund_turnovers;
DROP POLICY IF EXISTS turnover_read ON public.fund_turnovers;
DROP POLICY IF EXISTS rfp_legacy_handover_management_read ON public.fund_turnovers;
CREATE POLICY rfp_legacy_handover_management_read
ON public.fund_turnovers
FOR SELECT TO authenticated
USING(
 private.is_admin()
 OR (private.my_role()='Branch Manager' AND branch_id=private.my_branch())
);

COMMIT;
