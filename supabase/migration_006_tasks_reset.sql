-- Apply AFTER migration_005_daily_controls.sql. No existing records deleted by this migration.
BEGIN;
CREATE OR REPLACE FUNCTION public.reset_test_financial_data(p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role only'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role='Super Admin' AND is_active) THEN RAISE EXCEPTION 'Verified Super Admin required'; END IF;
  PERFORM pg_advisory_xact_lock(18273645);
  DELETE FROM public.branch_discrepancies;
  DELETE FROM public.daily_cash_counts;
  DELETE FROM public.fund_turnovers;
  DELETE FROM public.petty_liquidations;
  DELETE FROM public.cash_reconciliations;
  DELETE FROM public.camera_sessions;
  DELETE FROM public.pos_accounts;
  DELETE FROM public.cash_transactions;
  DELETE FROM public.audit_logs;
  INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
  VALUES(p_actor,'system_reset',p_actor::text,'TEST_DATA_RESET',jsonb_build_object('message','Authorized test data reset','at',now()));
END $$;
REVOKE ALL ON FUNCTION public.reset_test_financial_data(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_test_financial_data(uuid) TO service_role;
-- Force server time enforcement on EOD even if the frontend clock is manipulated.
-- Supersede existing function's body without rebuilding existing records.
COMMIT;

BEGIN;
-- Do not permit a cashier to bypass the 4 PM cutoff by modifying browser time.
ALTER FUNCTION public.submit_daily_count(text,text,numeric,text,text) RENAME TO submit_daily_count_internal;
REVOKE ALL ON FUNCTION public.submit_daily_count_internal(text,text,numeric,text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.submit_daily_count(p_account text,p_type text,p_actual numeric,p_signature text,p_explanation text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF p_type='EOD' AND (now() AT TIME ZONE 'Asia/Manila')::time < time '16:00' THEN
  RAISE EXCEPTION 'EOD unlocks at 4:00 PM Philippine time';
 END IF;
 RETURN public.submit_daily_count_internal(p_account,p_type,p_actual,p_signature,p_explanation);
END $$;
REVOKE ALL ON FUNCTION public.submit_daily_count(text,text,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_daily_count(text,text,numeric,text,text) TO authenticated;

-- Gate Petty Cash / Funds postings: BOD must be recorded for the relevant account.
-- Supersede only signed cash posting; existing BOD historical records are untouched.
CREATE OR REPLACE FUNCTION private.require_opening_cash_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_day date :=(now() AT TIME ZONE 'Asia/Manila')::date; v_count uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts c
   WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='BOD' AND c.business_date=v_day)
 THEN RAISE EXCEPTION 'Complete today''s % BOD task before recording transactions',NEW.account; END IF;
 IF EXISTS(SELECT 1 FROM public.branch_discrepancies d JOIN public.daily_cash_counts c ON c.id=d.count_id
   WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.business_date=v_day
   AND c.count_type='BOD' AND d.status NOT IN ('Acknowledged','Resolved'))
 THEN RAISE EXCEPTION 'BOD discrepancy needs BM acknowledgment before money movements'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_cash_bod_gate ON public.cash_transactions;
CREATE TRIGGER zz_cash_bod_gate BEFORE INSERT ON public.cash_transactions FOR EACH ROW
 EXECUTE FUNCTION private.require_opening_cash_count();
COMMIT;
