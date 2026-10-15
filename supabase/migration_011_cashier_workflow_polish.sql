-- CMS v11 cashier workflow polish.
-- Run AFTER migration_010_workflow_revision.sql.
-- Adds quotation item type validation, payment reference enforcement,
-- and the 5:00 PM Closing Cash Count gate while preserving legacy BOD/EOD database codes.
BEGIN;

-- New POS creation: every quotation item must be Service or Part.
-- Non-cash payments require a reference number.
CREATE OR REPLACE FUNCTION public.create_pos_v2(
 p_id text,p_client text,p_phone text,p_vehicle text,p_vehicle_year text,p_vehicle_brand text,p_vehicle_model text,
 p_plate text,p_concern text,p_items jsonb,p_payments jsonb,p_costs numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;v_total numeric:=0;v_paid numeric:=0;v_vehicle text:=regexp_replace(btrim(coalesce(p_vehicle,'')),'\s+',' ','g');
BEGIN
 PERFORM private.assert_active();
 IF auth.uid() IS NULL OR nullif(trim(p_client),'') IS NULL OR nullif(v_vehicle,'') IS NULL OR p_costs<0 OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_typeof(p_payments)<>'array' THEN RAISE EXCEPTION 'Invalid POS data'; END IF;
 FOR j IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(j->'name')<>'string' OR nullif(trim(j->>'name'),'') IS NULL OR coalesce(j->>'type','') NOT IN ('Service','Part') OR (j->>'qty')::numeric<=0 OR (j->>'price')::numeric<0 THEN RAISE EXCEPTION 'Invalid quotation item'; END IF;
  v_total:=v_total+(j->>'qty')::numeric*(j->>'price')::numeric;
 END LOOP;
 FOR j IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
  IF (j->>'amount')::numeric<=0 OR nullif(j->>'method','') IS NULL THEN RAISE EXCEPTION 'Invalid payment'; END IF;
  IF j->>'method'<>'Cash' AND nullif(trim(coalesce(j->>'reference','')),'') IS NULL THEN RAISE EXCEPTION 'Payment reference is required for non-cash payments'; END IF;
  v_paid:=v_paid+(j->>'amount')::numeric;
 END LOOP;
 IF v_paid<=0 THEN RAISE EXCEPTION 'At least one payment is required'; END IF;
 IF v_paid>v_total+0.005 THEN RAISE EXCEPTION 'Overpayment is not allowed'; END IF;
 INSERT INTO public.pos_accounts(id,actor_id,client,phone,vehicle,vehicle_year,vehicle_brand,vehicle_model,plate,concern,items,payments,costs)
 VALUES(p_id,auth.uid(),btrim(p_client),coalesce(p_phone,''),v_vehicle,nullif(btrim(p_vehicle_year),''),nullif(regexp_replace(btrim(coalesce(p_vehicle_brand,'')),'\s+',' ','g'),''),nullif(regexp_replace(btrim(coalesce(p_vehicle_model,'')),'\s+',' ','g'),''),coalesce(p_plate,''),coalesce(p_concern,''),p_items,p_payments,p_costs);
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'pos',p_id,'POS created as Pending',jsonb_build_object('vehicle_year',p_vehicle_year,'vehicle_brand',p_vehicle_brand,'vehicle_model',p_vehicle_model));
END $$;
REVOKE ALL ON FUNCTION public.create_pos_v2(text,text,text,text,text,text,text,text,text,jsonb,jsonb,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_pos_v2(text,text,text,text,text,text,text,text,text,jsonb,jsonb,numeric) TO authenticated;

-- Normalize historical quotation items, then guard every write path (including approved corrections)
-- so each item keeps an explicit Service / Part type.
UPDATE public.pos_accounts p
SET items=(SELECT coalesce(jsonb_agg(CASE WHEN e ? 'type' THEN e ELSE e||jsonb_build_object('type','Service') END),'[]'::jsonb)
           FROM jsonb_array_elements(coalesce(p.items,'[]'::jsonb)) e)
WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.items,'[]'::jsonb)) e WHERE NOT (e ? 'type'));

CREATE OR REPLACE FUNCTION private.validate_pos_item_types() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;
BEGIN
 IF jsonb_typeof(NEW.items)<>'array' THEN RAISE EXCEPTION 'Quotation items must be an array'; END IF;
 FOR j IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
  IF coalesce(j->>'type','') NOT IN ('Service','Part') OR nullif(trim(j->>'name'),'') IS NULL OR (j->>'qty')::numeric<=0 OR (j->>'price')::numeric<0
  THEN RAISE EXCEPTION 'Each quotation item requires a Service/Part type, description, valid quantity and price'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pos_item_type_guard ON public.pos_accounts;
CREATE TRIGGER pos_item_type_guard BEFORE INSERT OR UPDATE OF items ON public.pos_accounts
FOR EACH ROW EXECUTE FUNCTION private.validate_pos_item_types();

-- Additional quotation items also require a clear Service / Part type.
CREATE OR REPLACE FUNCTION public.add_pos_additional(p_id text,p_items jsonb,p_cogs jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.pos_accounts%rowtype; j jsonb; extra numeric:=0; cost numeric:=0;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
 SELECT * INTO v FROM public.pos_accounts WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'Pending' THEN RAISE EXCEPTION 'POS is closed or unavailable'; END IF;
 IF v.actor_id<>auth.uid() AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('Admin','Super Admin')) THEN RAISE EXCEPTION 'Not authorized for this POS'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active=true) THEN RAISE EXCEPTION 'Account disabled'; END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_typeof(p_cogs)<>'array' THEN RAISE EXCEPTION 'Invalid additional transaction'; END IF;
 FOR j IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF nullif(trim(j->>'name'),'') IS NULL OR coalesce(j->>'type','') NOT IN ('Service','Part') OR (j->>'qty')::numeric<=0 OR (j->>'price')::numeric<0 THEN RAISE EXCEPTION 'Invalid quotation item'; END IF;
  extra:=extra+(j->>'qty')::numeric*(j->>'price')::numeric;
 END LOOP;
 FOR j IN SELECT value FROM jsonb_array_elements(p_cogs) LOOP
  IF nullif(trim(j->>'name'),'') IS NULL OR nullif(trim(j->>'supplier'),'') IS NULL OR (j->>'qty')::numeric<=0 OR (j->>'unitCost')::numeric<0 THEN RAISE EXCEPTION 'Invalid cost item'; END IF;
  cost:=cost+(j->>'qty')::numeric*(j->>'unitCost')::numeric;
 END LOOP;
 INSERT INTO public.pos_additional_transactions(pos_id,actor_id,items,cogs_items) VALUES(p_id,auth.uid(),p_items,p_cogs);
 UPDATE public.pos_accounts SET items=items||p_items,cogs_items=cogs_items||p_cogs,costs=costs+cost WHERE id=p_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'pos',p_id,'Additional transaction recorded',jsonb_build_object('sale_amount',extra,'cost_amount',cost));
END $$;
REVOKE ALL ON FUNCTION public.add_pos_additional(text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_pos_additional(text,jsonb,jsonb) TO authenticated;

-- Additional payments use a v2 RPC so digital references are retained in the JSON ledger.
CREATE OR REPLACE FUNCTION public.add_pos_payment_v2(p_id text,p_amount numeric,p_method text,p_reference text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.pos_accounts%rowtype;due numeric;paid numeric;v_reference text:=btrim(coalesce(p_reference,''));
BEGIN
 PERFORM private.assert_active();
 SELECT * INTO v FROM public.pos_accounts WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'Pending' THEN RAISE EXCEPTION 'POS account is not pending'; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>100000000 OR nullif(trim(p_method),'') IS NULL THEN RAISE EXCEPTION 'Invalid payment'; END IF;
 IF p_method<>'Cash' AND nullif(v_reference,'') IS NULL THEN RAISE EXCEPTION 'Payment reference is required for non-cash payments'; END IF;
 SELECT coalesce(sum((x->>'qty')::numeric*(x->>'price')::numeric),0) INTO due FROM jsonb_array_elements(v.items) x;
 SELECT coalesce(sum((x->>'amount')::numeric),0) INTO paid FROM jsonb_array_elements(v.payments) x;
 IF paid+p_amount>due+0.005 THEN RAISE EXCEPTION 'Overpayment is not allowed'; END IF;
 UPDATE public.pos_accounts SET payments=payments||jsonb_build_array(jsonb_build_object('amount',p_amount,'method',p_method,'reference',v_reference,'at',now())) WHERE id=p_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'pos',p_id,'Additional payment recorded',jsonb_build_object('amount',p_amount,'method',p_method,'reference',v_reference));
END $$;
REVOKE ALL ON FUNCTION public.add_pos_payment_v2(text,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_pos_payment_v2(text,numeric,text,text) TO authenticated;

-- Fund activity is blocked at 5:00 PM until the Closing Cash Count is completed.
CREATE OR REPLACE FUNCTION private.require_opening_cash_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_clock time:=(now() AT TIME ZONE 'Asia/Manila')::time;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='BOD' AND c.business_date=v_day)
 THEN RAISE EXCEPTION 'Complete today''s % Opening Cash Count before posting fund activity',NEW.account; END IF;
 IF v_clock>=time '17:00' AND NOT EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='EOD' AND c.business_date=v_day)
 THEN RAISE EXCEPTION 'Complete today''s % Closing Cash Count before continuing fund activity',NEW.account; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='EOD' AND c.business_date=v_day)
 THEN RAISE EXCEPTION 'Today''s Closing Cash Count is already complete. Await the next Opening Cash Count'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='BOD' AND c.business_date=v_day AND abs(c.difference)>0.005)
 AND NOT EXISTS(SELECT 1 FROM public.cash_incident_reports i WHERE i.branch_id=NEW.branch_id AND i.cash_account=NEW.account AND i.incident_type='BOD Discrepancy' AND i.business_date=v_day)
 THEN RAISE EXCEPTION 'Opening Cash Count discrepancy incident report required'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='BOD' AND c.business_date<v_day
 AND NOT EXISTS(SELECT 1 FROM public.daily_cash_counts e WHERE e.branch_id=c.branch_id AND e.cash_account=c.cash_account AND e.business_date=c.business_date AND e.count_type='EOD')
 AND NOT EXISTS(SELECT 1 FROM public.cash_incident_reports i WHERE i.branch_id=c.branch_id AND i.cash_account=c.cash_account AND i.incident_type='Missed EOD' AND i.business_date=c.business_date))
 THEN RAISE EXCEPTION 'Submit all outstanding missed Closing Cash Count incident reports before fund activity'; END IF;
 RETURN NEW;
END $$;

-- POS cash payments are blocked after 5:00 PM until Closing Cash Count, and locked once it is completed.
CREATE OR REPLACE FUNCTION private.require_funds_bod_for_pos_cash() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_clock time:=(now() AT TIME ZONE 'Asia/Manila')::time;v_has_cash boolean;
BEGIN
 IF TG_OP='UPDATE' AND NEW.payments IS NOT DISTINCT FROM OLD.payments THEN RETURN NEW; END IF;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.payments,'[]'::jsonb)) v WHERE v->>'method'='Cash') INTO v_has_cash;
 IF NOT v_has_cash THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=NEW.branch_id AND cash_account='Funds' AND count_type='BOD' AND business_date=v_day) THEN RAISE EXCEPTION 'Funds Opening Cash Count is required before accepting a cash payment in POS'; END IF;
 IF v_clock>=time '17:00' AND NOT EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=NEW.branch_id AND cash_account='Funds' AND count_type='EOD' AND business_date=v_day) THEN RAISE EXCEPTION 'Funds Closing Cash Count is required before continuing cashier operations'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=NEW.branch_id AND cash_account='Funds' AND count_type='EOD' AND business_date=v_day) THEN RAISE EXCEPTION 'Funds Closing Cash Count is already complete; cash payments are locked'; END IF;
 RETURN NEW;
END $$;

COMMIT;
