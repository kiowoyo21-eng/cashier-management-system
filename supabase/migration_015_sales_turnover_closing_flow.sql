-- CMS v15: Cashier closing-flow correction.
-- Run AFTER migration_014_plate_lookup_and_pos_polish.sql.
-- Final cashier end-of-day tasks:
--   1) Revolving Fund Closing Cash Count
--   2) Sales Turnover
-- Sales no longer uses a standalone Closing Cash Count and there is no Close Shift action.
BEGIN;

-- ---------------------------------------------------------------------------
-- Prevent new Cashier Sales EOD count records. Historical rows remain readable.
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


-- Keep the existing ID guard but use the final user-facing terminology.
CREATE OR REPLACE FUNCTION private.sales_handover_id_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.id NOT LIKE 'SALES-HO-%' THEN
  RAISE EXCEPTION 'Invalid Sales Turnover transaction number';
 END IF;
 RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Sales Turnover: actual Sales cash is entered in the turnover itself.
-- Expected cash = today's Sales Opening Cash Count + today's closed cash sales.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_sales_turnover(
 p_id text,
 p_actual_cash numeric,
 p_received_by text,
 p_remarks text,
 p_signature text,
 p_proof text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
 v_branch uuid;
 v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;
 v_opening numeric(14,2):=0;
 v_gross numeric(14,2):=0;
 v_cash numeric(14,2):=0;
 v_card numeric(14,2):=0;
 v_digital numeric(14,2):=0;
 v_expected numeric(14,2):=0;
 v_count integer:=0;
 v_first text;
 v_last text;
BEGIN
 PERFORM private.assert_active();

 SELECT branch_id INTO v_branch
 FROM public.profiles
 WHERE id=auth.uid() AND role='Cashier' AND is_active=true;

 IF v_branch IS NULL THEN
  RAISE EXCEPTION 'Assigned Cashier role required';
 END IF;

 IF p_id NOT LIKE 'SALES-HO-%' THEN
  RAISE EXCEPTION 'Invalid Sales Turnover transaction number';
 END IF;

 IF p_actual_cash IS NULL OR p_actual_cash<0 OR p_actual_cash>100000000 THEN
  RAISE EXCEPTION 'Enter a valid actual cash turnover amount';
 END IF;

 IF nullif(btrim(coalesce(p_received_by,'')),'') IS NULL THEN
  RAISE EXCEPTION 'Received By is required';
 END IF;

 IF p_signature IS NULL
 OR split_part(p_signature,'/',1)<>auth.uid()::text
 OR NOT EXISTS(
   SELECT 1 FROM storage.objects
   WHERE bucket_id='transaction-evidence' AND name=p_signature
 ) THEN
  RAISE EXCEPTION 'Cashier signature is required';
 END IF;

 IF p_proof IS NOT NULL THEN
  IF split_part(p_proof,'/',1)<>auth.uid()::text
  OR NOT EXISTS(
    SELECT 1 FROM storage.objects
    WHERE bucket_id='transaction-evidence' AND name=p_proof
  ) THEN
   RAISE EXCEPTION 'Invalid Sales Turnover proof';
  END IF;
 END IF;

 IF EXISTS(
   SELECT 1 FROM public.daily_sales_handovers
   WHERE branch_id=v_branch AND business_date=v_day AND cashier_id=auth.uid()
 ) THEN
  RAISE EXCEPTION 'Sales Turnover is already completed for today';
 END IF;

 SELECT actual INTO v_opening
 FROM public.daily_cash_counts
 WHERE branch_id=v_branch
   AND cash_account='Sales'
   AND business_date=v_day
   AND count_type='BOD'
 LIMIT 1;

 IF v_opening IS NULL THEN
  RAISE EXCEPTION 'Complete Sales Opening Cash Count before Sales Turnover';
 END IF;

 SELECT
  coalesce(sum((SELECT coalesce(sum((i->>'qty')::numeric*(i->>'price')::numeric),0)
                FROM jsonb_array_elements(coalesce(p.items,'[]'::jsonb)) i)),0),
  count(*),
  min(nullif(btrim(p.bs_si),'')),
  max(nullif(btrim(p.bs_si),''))
 INTO v_gross,v_count,v_first,v_last
 FROM public.pos_accounts p
 WHERE p.branch_id=v_branch
   AND p.status='Closed'
   AND (p.closed_at AT TIME ZONE 'Asia/Manila')::date=v_day;

 SELECT
  coalesce(sum(CASE WHEN pay->>'method'='Cash' THEN coalesce((pay->>'amount')::numeric,0) ELSE 0 END),0),
  coalesce(sum(CASE WHEN pay->>'method'='Card' THEN coalesce((pay->>'amount')::numeric,0) ELSE 0 END),0),
  coalesce(sum(CASE WHEN pay->>'method' IN ('GCash','Maya','Bank Transfer','Cheque','Other') THEN coalesce((pay->>'amount')::numeric,0) ELSE 0 END),0)
 INTO v_cash,v_card,v_digital
 FROM public.pos_accounts p
 CROSS JOIN LATERAL jsonb_array_elements(coalesce(p.payments,'[]'::jsonb)) pay
 WHERE p.branch_id=v_branch
   AND p.status='Closed'
   AND (p.closed_at AT TIME ZONE 'Asia/Manila')::date=v_day;

 v_expected:=coalesce(v_opening,0)+coalesce(v_cash,0);

 INSERT INTO public.daily_sales_handovers(
  id,branch_id,business_date,cashier_id,
  gross_sales,cash_sales,card_sales,digital_sales,
  expected_cash,actual_cash,difference,transaction_count,
  bs_si_start,bs_si_end,received_by,remarks,signature_path,proof_path
 ) VALUES(
  p_id,v_branch,v_day,auth.uid(),
  v_gross,v_cash,v_card,v_digital,
  v_expected,p_actual_cash,p_actual_cash-v_expected,v_count,
  v_first,v_last,btrim(p_received_by),nullif(btrim(coalesce(p_remarks,'')),''),p_signature,p_proof
 );

 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(
  auth.uid(),'sales_turnover',p_id,'Sales Turnover submitted',
  jsonb_build_object(
   'gross_sales',v_gross,
   'cash_sales',v_cash,
   'opening_cash',v_opening,
   'expected_cash',v_expected,
   'actual_cash',p_actual_cash,
   'difference',p_actual_cash-v_expected
  )
 );

 RETURN p_id;
END $$;

REVOKE ALL ON FUNCTION public.submit_sales_turnover(text,numeric,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_sales_turnover(text,numeric,text,text,text,text) TO authenticated;

-- Legacy Daily Sales Handover RPC is no longer part of the cashier workflow.
REVOKE EXECUTE ON FUNCTION public.submit_daily_sales_handover(text,text,text,text,text) FROM authenticated;

-- Close Cashier Shift is intentionally retired. Completion is defined by the
-- Revolving Fund Closing Cash Count + Sales Turnover pair.
REVOKE EXECUTE ON FUNCTION public.close_cashier_shift() FROM authenticated;

-- ---------------------------------------------------------------------------
-- POS/Sales write gate: Opening Cash Count is required. At 5:00 PM cashier
-- Sales writes stop for closing. After Sales Turnover, new Sales writes remain
-- locked until the next business day.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.pos_role_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
 v_role text;
 v_branch uuid;
 v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;
 v_clock time:=(now() AT TIME ZONE 'Asia/Manila')::time;
BEGIN
 SELECT role,branch_id INTO v_role,v_branch
 FROM public.profiles
 WHERE id=auth.uid() AND is_active=true;

 IF v_role NOT IN ('Cashier','Admin','Branch Manager','Super Admin') THEN
  RAISE EXCEPTION 'POS / Sales activity is restricted to Cashier or authorized management';
 END IF;

 IF TG_OP='INSERT' AND NEW.id NOT LIKE 'POS-%' THEN
  RAISE EXCEPTION 'Invalid POS transaction number';
 END IF;

 IF v_role IN ('Cashier','Branch Manager')
 AND NEW.branch_id IS DISTINCT FROM v_branch THEN
  RAISE EXCEPTION 'POS branch does not match your assigned branch';
 END IF;

 IF v_role='Cashier' THEN
  IF NOT EXISTS(
    SELECT 1 FROM public.daily_cash_counts
    WHERE branch_id=v_branch
      AND cash_account='Sales'
      AND count_type='BOD'
      AND business_date=v_day
  ) THEN
   RAISE EXCEPTION 'Sales Opening Cash Count is required before POS activity';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.daily_sales_handovers
    WHERE branch_id=v_branch
      AND business_date=v_day
      AND cashier_id=auth.uid()
  ) THEN
   RAISE EXCEPTION 'Sales Turnover is already complete; Sales activity is locked for today';
  END IF;

  IF v_clock>=time '17:00' THEN
   RAISE EXCEPTION 'Sales Turnover is required; POS activity is locked for end-of-day closing';
  END IF;
 END IF;

 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.pos_role_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.pos_role_guard() TO authenticated;

DROP TRIGGER IF EXISTS pos_role_guard ON public.pos_accounts;
CREATE TRIGGER pos_role_guard
BEFORE INSERT OR UPDATE ON public.pos_accounts
FOR EACH ROW EXECUTE FUNCTION private.pos_role_guard();

-- Cash-payment trigger updated to the same Sales Turnover workflow.
CREATE OR REPLACE FUNCTION private.require_funds_bod_for_pos_cash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
 v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;
 v_clock time:=(now() AT TIME ZONE 'Asia/Manila')::time;
 v_has_cash boolean;
BEGIN
 IF TG_OP='UPDATE' AND NEW.payments IS NOT DISTINCT FROM OLD.payments THEN
  RETURN NEW;
 END IF;

 SELECT EXISTS(
   SELECT 1 FROM jsonb_array_elements(coalesce(NEW.payments,'[]'::jsonb)) v
   WHERE v->>'method'='Cash'
 ) INTO v_has_cash;

 IF NOT v_has_cash THEN RETURN NEW; END IF;

 IF NOT EXISTS(
   SELECT 1 FROM public.daily_cash_counts
   WHERE branch_id=NEW.branch_id
     AND cash_account='Sales'
     AND count_type='BOD'
     AND business_date=v_day
 ) THEN
  RAISE EXCEPTION 'Sales Opening Cash Count is required before accepting cash payments';
 END IF;

 IF EXISTS(
   SELECT 1 FROM public.daily_sales_handovers
   WHERE branch_id=NEW.branch_id AND business_date=v_day
 ) THEN
  RAISE EXCEPTION 'Sales Turnover is already complete; cash payments are locked for today';
 END IF;

 IF v_clock>=time '17:00' THEN
  RAISE EXCEPTION 'Sales Turnover is required; cash payments are locked for end-of-day closing';
 END IF;

 RETURN NEW;
END $$;

COMMIT;
