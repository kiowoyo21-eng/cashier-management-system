-- Migration 027 — Reviews #006 & #007
-- Run AFTER migration_026_review_fixes.sql. Backup database first.
-- Add-only for vehicle registry; restores missing v3 cash RPC. No financial records deleted.
BEGIN;

-- 006: Restore the precise argument signature expected by lib/backend.ts.
-- Copied from migration 019, with the current Parts-only and four-branch rules.
CREATE OR REPLACE FUNCTION public.create_cash_transaction_v3(
 p_id text,p_account text,p_kind text,p_amount numeric,p_category text,p_description text,p_signature text,p_proof text DEFAULT NULL,
 p_transaction_date date DEFAULT NULL,p_payee text DEFAULT '',p_vat_type text DEFAULT '',p_cash_voucher_no text DEFAULT '',
 p_receipt_no text DEFAULT '',p_tin_no text DEFAULT '',p_notes text DEFAULT '',p_vehicle_unit text DEFAULT '',p_plate_number text DEFAULT '',
 p_quantity numeric DEFAULT 1,p_unit_cost numeric DEFAULT 0,p_branch_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_date date:=coalesce(p_transaction_date,(now() AT TIME ZONE 'Asia/Manila')::date);v_vat text:=nullif(btrim(coalesce(p_vat_type,'')),'');v_plate text:=upper(regexp_replace(coalesce(p_plate_number,''),'[^A-Za-z0-9]','','g'));v_role text;v_profile_branch uuid;
BEGIN
 PERFORM private.assert_active();
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT role,branch_id INTO v_role,v_profile_branch FROM public.profiles WHERE id=auth.uid();
 IF p_account='Funds' AND p_kind='Additional Funds' THEN RAISE EXCEPTION 'RFP replenishment requires an approved Disbursement Request'; END IF;
 IF p_account IS NULL OR p_kind IS NULL OR p_amount IS NULL OR p_category IS NULL OR p_description IS NULL OR p_account NOT IN ('Petty Cash','Funds') OR p_kind NOT IN ('Additional Funds','Expense') OR p_amount<=0 OR p_amount>100000000 OR nullif(btrim(p_category),'') IS NULL OR nullif(btrim(p_description),'') IS NULL THEN RAISE EXCEPTION 'Invalid transaction details'; END IF;
 IF v_vat IS NOT NULL AND v_vat NOT IN ('VAT','Non-VAT') THEN RAISE EXCEPTION 'VAT type must be VAT or Non-VAT'; END IF;
 IF p_kind='Expense' AND nullif(btrim(coalesce(p_payee,'')),'') IS NULL THEN RAISE EXCEPTION 'Supplier / Payee is required for an expense'; END IF;
 IF p_account='Funds' AND p_kind='Expense' THEN
  IF p_category IS DISTINCT FROM 'Part' THEN RAISE EXCEPTION 'RFP expenses are for Parts only'; END IF;
  IF p_branch_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch_id AND name IN ('Mastermind Mandaluyong','Underchargers Mandaluyong','Underchargers Las Piñas','Underchargers Quezon City')) THEN RAISE EXCEPTION 'Select one of the four authorized RFP branches'; END IF;
  IF p_quantity IS NULL OR p_quantity<=0 OR p_unit_cost IS NULL OR p_unit_cost<=0 THEN RAISE EXCEPTION 'RFP quantity and unit cost are required'; END IF;
  IF abs(p_amount-(p_quantity*p_unit_cost))>0.01 THEN RAISE EXCEPTION 'RFP amount must equal quantity multiplied by unit cost'; END IF;
  IF nullif(btrim(coalesce(p_vehicle_unit,'')),'') IS NULL OR nullif(v_plate,'') IS NULL THEN RAISE EXCEPTION 'RFP vehicle/unit and plate number (or NA) are required'; END IF;
 END IF;
 IF p_account='Petty Cash' AND p_kind='Additional Funds' AND p_proof IS NULL THEN RAISE EXCEPTION 'Replenishment proof is required'; END IF;
 IF p_signature IS NULL OR split_part(p_signature,'/',1)<>auth.uid()::text THEN RAISE EXCEPTION 'Invalid signature attachment'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_signature) THEN RAISE EXCEPTION 'Signature image not found'; END IF;
 IF p_proof IS NOT NULL AND (split_part(p_proof,'/',1)<>auth.uid()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_proof)) THEN RAISE EXCEPTION 'Invalid proof attachment'; END IF;
 INSERT INTO public.cash_transactions(id,account,kind,amount,category,description,actor_id,signature_path,proof_path,transaction_date,payee,vat_type,cash_voucher_no,receipt_no,tin_no,notes,vehicle_unit,plate_number,quantity,unit_cost,branch_id)
 VALUES(p_id,p_account,p_kind,p_amount,btrim(p_category),btrim(p_description),auth.uid(),p_signature,p_proof,v_date,nullif(btrim(p_payee),''),v_vat,nullif(btrim(p_cash_voucher_no),''),nullif(btrim(p_receipt_no),''),nullif(btrim(p_tin_no),''),nullif(btrim(p_notes),''),nullif(btrim(p_vehicle_unit),''),nullif(v_plate,''),coalesce(p_quantity,1),coalesce(p_unit_cost,p_amount),CASE WHEN p_account='Funds' AND p_kind='Expense' THEN p_branch_id ELSE v_profile_branch END);
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'cash',p_id,CASE WHEN p_kind='Expense' THEN 'Expense recorded' ELSE 'Fund replenishment recorded' END,jsonb_build_object('account',p_account,'transaction_date',v_date,'category',p_category,'payee',p_payee,'vehicle_unit',p_vehicle_unit,'plate_number',v_plate));
END $$;
REVOKE ALL ON FUNCTION public.create_cash_transaction_v3(text,text,text,numeric,text,text,text,text,date,text,text,text,text,text,text,text,text,numeric,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_cash_transaction_v3(text,text,text,numeric,text,text,text,text,date,text,text,text,text,text,text,text,text,numeric,numeric,uuid) TO authenticated;

-- 007: Independent plate/vehicle reference. No FK to POS, so transaction test resets
-- do not accidentally erase vehicle history. Access ONLY via authenticated RPC.
CREATE TABLE IF NOT EXISTS public.vehicle_registry (
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 plate text NOT NULL,
 client text NOT NULL DEFAULT '',
 phone text NOT NULL DEFAULT '',
 customer_tin text NOT NULL DEFAULT '',
 customer_address text NOT NULL DEFAULT '',
 vehicle text NOT NULL DEFAULT '',
 vehicle_year text NOT NULL DEFAULT '',
 vehicle_brand text NOT NULL DEFAULT '',
 vehicle_model text NOT NULL DEFAULT '',
 platform text NOT NULL DEFAULT '',
 service_advisor text NOT NULL DEFAULT '',
 booked_by text NOT NULL DEFAULT '',
 source_pos_id text,
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(branch_id,plate),
 CONSTRAINT vehicle_registry_plate_valid CHECK (length(plate) BETWEEN 2 AND 16 AND plate ~ '^[A-Z0-9]+$')
);
ALTER TABLE public.vehicle_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicle_registry FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS vehicle_registry_plate_idx ON public.vehicle_registry(plate);

-- POS inserts/updates refresh history. A missing/short plate never creates an entry.
-- A DELETE on POS intentionally does NOT delete the vehicle registry.
CREATE OR REPLACE FUNCTION private.upsert_vehicle_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_plate text := upper(regexp_replace(coalesce(NEW.plate,''),'[^A-Za-z0-9]','','g'));
BEGIN
 -- A corrected plate/branch must not keep a stale alias pointing at this POS.
 IF TG_OP='UPDATE' THEN
  IF (OLD.branch_id IS DISTINCT FROM NEW.branch_id OR
      upper(regexp_replace(coalesce(OLD.plate,''),'[^A-Za-z0-9]','','g')) IS DISTINCT FROM v_plate)
      AND OLD.branch_id IS NOT NULL THEN
   DELETE FROM public.vehicle_registry
   WHERE branch_id=OLD.branch_id
     AND plate=upper(regexp_replace(coalesce(OLD.plate,''),'[^A-Za-z0-9]','','g'))
     AND source_pos_id=OLD.id;
  END IF;
 END IF;
 IF NEW.branch_id IS NULL OR length(v_plate) NOT BETWEEN 2 AND 16 THEN RETURN NEW; END IF;
 INSERT INTO public.vehicle_registry (
  branch_id,plate,client,phone,customer_tin,customer_address,vehicle,vehicle_year,
  vehicle_brand,vehicle_model,platform,service_advisor,booked_by,source_pos_id,last_seen_at
 ) VALUES (
  NEW.branch_id,v_plate,coalesce(NEW.client,''),coalesce(NEW.phone,''),
  coalesce(NEW.customer_tin,''),coalesce(NEW.customer_address,''),coalesce(NEW.vehicle,''),
  coalesce(NEW.vehicle_year,''),coalesce(NEW.vehicle_brand,''),coalesce(NEW.vehicle_model,''),
  coalesce(NEW.platform,''),coalesce(NEW.service_advisor,''),coalesce(NEW.booked_by,''),NEW.id,now()
 ) ON CONFLICT(branch_id,plate) DO UPDATE SET
  client=EXCLUDED.client,phone=EXCLUDED.phone,customer_tin=EXCLUDED.customer_tin,
  customer_address=EXCLUDED.customer_address,vehicle=EXCLUDED.vehicle,
  vehicle_year=EXCLUDED.vehicle_year,vehicle_brand=EXCLUDED.vehicle_brand,
  vehicle_model=EXCLUDED.vehicle_model,platform=EXCLUDED.platform,
  service_advisor=EXCLUDED.service_advisor,booked_by=EXCLUDED.booked_by,
  source_pos_id=EXCLUDED.source_pos_id,last_seen_at=EXCLUDED.last_seen_at;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.upsert_vehicle_history() FROM PUBLIC,anon;
DROP TRIGGER IF EXISTS vehicle_history_upsert ON public.pos_accounts;
CREATE TRIGGER vehicle_history_upsert AFTER INSERT OR UPDATE OF
 plate,client,phone,customer_tin,customer_address,vehicle,vehicle_year,
 vehicle_brand,vehicle_model,platform,service_advisor,booked_by,branch_id
ON public.pos_accounts FOR EACH ROW EXECUTE FUNCTION private.upsert_vehicle_history();

-- Backfill only the latest POS per branch + normalized plate.  This is safe to
-- rerun: existing newer entries in the registry win over historical POS rows.
INSERT INTO public.vehicle_registry (
 branch_id,plate,client,phone,customer_tin,customer_address,vehicle,vehicle_year,
 vehicle_brand,vehicle_model,platform,service_advisor,booked_by,source_pos_id,last_seen_at
)
SELECT DISTINCT ON (branch_id,plate)
 branch_id,plate,client,phone,customer_tin,customer_address,vehicle,vehicle_year,
 vehicle_brand,vehicle_model,platform,service_advisor,booked_by,source_pos_id,last_seen_at
FROM (
 SELECT p.branch_id,
  upper(regexp_replace(coalesce(p.plate,''),'[^A-Za-z0-9]','','g')) plate,
  coalesce(p.client,'') client,coalesce(p.phone,'') phone,
  coalesce(p.customer_tin,'') customer_tin,coalesce(p.customer_address,'') customer_address,
  coalesce(p.vehicle,'') vehicle,coalesce(p.vehicle_year,'') vehicle_year,
  coalesce(p.vehicle_brand,'') vehicle_brand,coalesce(p.vehicle_model,'') vehicle_model,
  coalesce(p.platform,'') platform,coalesce(p.service_advisor,'') service_advisor,
  coalesce(p.booked_by,'') booked_by,p.id source_pos_id,p.created_at last_seen_at
 FROM public.pos_accounts p WHERE p.branch_id IS NOT NULL
) prior
WHERE length(plate) BETWEEN 2 AND 16
ORDER BY branch_id,plate,last_seen_at DESC,source_pos_id DESC
ON CONFLICT(branch_id,plate) DO UPDATE SET
 client=EXCLUDED.client,phone=EXCLUDED.phone,customer_tin=EXCLUDED.customer_tin,
 customer_address=EXCLUDED.customer_address,vehicle=EXCLUDED.vehicle,
 vehicle_year=EXCLUDED.vehicle_year,vehicle_brand=EXCLUDED.vehicle_brand,
 vehicle_model=EXCLUDED.vehicle_model,platform=EXCLUDED.platform,
 service_advisor=EXCLUDED.service_advisor,booked_by=EXCLUDED.booked_by,
 source_pos_id=EXCLUDED.source_pos_id,last_seen_at=EXCLUDED.last_seen_at
WHERE public.vehicle_registry.last_seen_at < EXCLUDED.last_seen_at;

-- Return limited matches, never the entire registry to the browser.
-- Cashier/BM can only access their own branch; Admin/Super Admin have all-branch access.
CREATE OR REPLACE FUNCTION public.lookup_vehicle_plates(p_query text)
RETURNS TABLE (
 plate text, source_pos_id text, client text, phone text, customer_tin text,
 customer_address text, vehicle text, vehicle_year text, vehicle_brand text,
 vehicle_model text, platform text, service_advisor text, booked_by text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;v_branch uuid;v_query text := upper(regexp_replace(coalesce(p_query,''),'[^A-Za-z0-9]','','g'));
BEGIN
 PERFORM private.assert_active();
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role NOT IN ('Cashier','Branch Manager','Admin','Super Admin') THEN
  RAISE EXCEPTION 'Vehicle lookup is not available for this role';
 END IF;
 IF length(v_query)<2 OR length(v_query)>16 THEN RETURN; END IF;
 IF v_role IN ('Cashier','Branch Manager') AND v_branch IS NULL THEN RETURN; END IF;
 RETURN QUERY SELECT
  r.plate,r.source_pos_id,r.client,r.phone,r.customer_tin,r.customer_address,
  r.vehicle,r.vehicle_year,r.vehicle_brand,r.vehicle_model,r.platform,
  r.service_advisor,r.booked_by
 FROM public.vehicle_registry r
 WHERE r.plate LIKE '%'||v_query||'%'
   AND (v_role IN ('Admin','Super Admin') OR r.branch_id=v_branch)
 ORDER BY CASE WHEN r.plate=v_query THEN 0 WHEN r.plate LIKE v_query||'%' THEN 1 ELSE 2 END,
          r.last_seen_at DESC,r.plate
 LIMIT 10;
END $$;
REVOKE ALL ON FUNCTION public.lookup_vehicle_plates(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lookup_vehicle_plates(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
