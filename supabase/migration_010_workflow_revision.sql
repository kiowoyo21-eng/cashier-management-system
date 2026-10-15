-- CMS v10 workflow terminology, vehicle master data, POS vehicle fields and suppliers.
-- Run AFTER migration_009_pos_items.sql. Existing data is preserved.
BEGIN;

-- ---------------------------------------------------------------------------
-- POS vehicle attributes used by independent searchable filters.
-- ---------------------------------------------------------------------------
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS vehicle_year text;
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS vehicle_brand text;
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS vehicle_model text;
CREATE INDEX IF NOT EXISTS pos_accounts_vehicle_year_idx ON public.pos_accounts(vehicle_year);
CREATE INDEX IF NOT EXISTS pos_accounts_vehicle_brand_idx ON public.pos_accounts(lower(vehicle_brand));
CREATE INDEX IF NOT EXISTS pos_accounts_vehicle_model_idx ON public.pos_accounts(lower(vehicle_model));
CREATE INDEX IF NOT EXISTS pos_accounts_closed_at_idx ON public.pos_accounts(closed_at DESC);

-- ---------------------------------------------------------------------------
-- Controlled vehicle master data. Values are normalized server-side so
-- Toyota / TOYOTA / " toyota " cannot become duplicate brands.
-- Model names are unique within a brand, not globally.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicle_brands(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 normalized_name text NOT NULL UNIQUE,
 is_active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.vehicle_models(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brand_id uuid NOT NULL REFERENCES public.vehicle_brands(id),
 name text NOT NULL,
 normalized_name text NOT NULL,
 is_active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(brand_id,normalized_name)
);
CREATE TABLE IF NOT EXISTS public.vehicle_years(
 year integer PRIMARY KEY CHECK(year BETWEEN 1900 AND 2100),
 is_active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vehicle_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_years ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_brands_read ON public.vehicle_brands;
DROP POLICY IF EXISTS vehicle_models_read ON public.vehicle_models;
DROP POLICY IF EXISTS vehicle_years_read ON public.vehicle_years;
CREATE POLICY vehicle_brands_read ON public.vehicle_brands FOR SELECT TO authenticated USING(true);
CREATE POLICY vehicle_models_read ON public.vehicle_models FOR SELECT TO authenticated USING(true);
CREATE POLICY vehicle_years_read ON public.vehicle_years FOR SELECT TO authenticated USING(true);
REVOKE ALL ON public.vehicle_brands,public.vehicle_models,public.vehicle_years FROM anon,authenticated;
GRANT SELECT ON public.vehicle_brands,public.vehicle_models,public.vehicle_years TO authenticated;

CREATE OR REPLACE FUNCTION public.add_vehicle_brand(p_name text) RETURNS public.vehicle_brands
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_name text:=regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g');v_norm text;v public.vehicle_brands%rowtype;
BEGIN
 PERFORM private.assert_active();
 IF length(v_name)<2 OR length(v_name)>80 THEN RAISE EXCEPTION 'Enter a valid car brand'; END IF;
 v_norm:=lower(v_name);
 SELECT * INTO v FROM public.vehicle_brands WHERE normalized_name=v_norm;
 IF FOUND THEN RETURN v; END IF;
 INSERT INTO public.vehicle_brands(name,normalized_name,created_by) VALUES(v_name,v_norm,auth.uid()) RETURNING * INTO v;
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.add_vehicle_year(p_year integer) RETURNS public.vehicle_years
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.vehicle_years%rowtype;
BEGIN
 PERFORM private.assert_active();
 IF p_year IS NULL OR p_year<1900 OR p_year>2100 THEN RAISE EXCEPTION 'Enter a valid year model'; END IF;
 INSERT INTO public.vehicle_years(year,created_by) VALUES(p_year,auth.uid()) ON CONFLICT(year) DO UPDATE SET is_active=true RETURNING * INTO v;
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.add_vehicle_model(p_brand_name text,p_name text) RETURNS public.vehicle_models
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_brand public.vehicle_brands%rowtype;v_name text:=regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g');v_norm text;v public.vehicle_models%rowtype;
BEGIN
 PERFORM private.assert_active();
 SELECT * INTO v_brand FROM public.add_vehicle_brand(p_brand_name);
 IF length(v_name)<1 OR length(v_name)>100 THEN RAISE EXCEPTION 'Enter a valid car model'; END IF;
 v_norm:=lower(v_name);
 SELECT * INTO v FROM public.vehicle_models WHERE brand_id=v_brand.id AND normalized_name=v_norm;
 IF FOUND THEN RETURN v; END IF;
 INSERT INTO public.vehicle_models(brand_id,name,normalized_name,created_by) VALUES(v_brand.id,v_name,v_norm,auth.uid()) RETURNING * INTO v;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.add_vehicle_brand(text),public.add_vehicle_year(integer),public.add_vehicle_model(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_vehicle_brand(text),public.add_vehicle_year(integer),public.add_vehicle_model(text,text) TO authenticated;


-- Management RPCs are reserved for management roles. Historical POS rows keep
-- their saved text values even if a master value is renamed or deactivated.
CREATE OR REPLACE FUNCTION private.require_vehicle_master_manager() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.assert_active();
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('Admin','Super Admin','Branch Manager') AND is_active=true)
 THEN RAISE EXCEPTION 'Admin, Branch Manager or Super Admin access required'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_vehicle_brand(p_id uuid,p_name text,p_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_name text:=regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g');v_norm text;
BEGIN
 PERFORM private.require_vehicle_master_manager();
 IF length(v_name)<2 OR length(v_name)>80 THEN RAISE EXCEPTION 'Enter a valid car brand'; END IF;
 v_norm:=lower(v_name);
 IF EXISTS(SELECT 1 FROM public.vehicle_brands WHERE normalized_name=v_norm AND id<>p_id) THEN RAISE EXCEPTION 'Car brand already exists'; END IF;
 UPDATE public.vehicle_brands SET name=v_name,normalized_name=v_norm,is_active=coalesce(p_active,true) WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Car brand not found'; END IF;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'vehicle_brand',p_id::text,'Vehicle brand updated',jsonb_build_object('name',v_name,'active',p_active));
END $$;

CREATE OR REPLACE FUNCTION public.update_vehicle_model(p_id uuid,p_brand_name text,p_name text,p_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_brand public.vehicle_brands%rowtype;v_name text:=regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g');v_norm text;
BEGIN
 PERFORM private.require_vehicle_master_manager();
 SELECT * INTO v_brand FROM public.vehicle_brands WHERE normalized_name=lower(regexp_replace(btrim(coalesce(p_brand_name,'')),'\s+',' ','g'));
 IF NOT FOUND THEN RAISE EXCEPTION 'Select an existing car brand'; END IF;
 IF length(v_name)<1 OR length(v_name)>100 THEN RAISE EXCEPTION 'Enter a valid car model'; END IF;
 v_norm:=lower(v_name);
 IF EXISTS(SELECT 1 FROM public.vehicle_models WHERE brand_id=v_brand.id AND normalized_name=v_norm AND id<>p_id) THEN RAISE EXCEPTION 'Car model already exists for this brand'; END IF;
 UPDATE public.vehicle_models SET brand_id=v_brand.id,name=v_name,normalized_name=v_norm,is_active=coalesce(p_active,true) WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Car model not found'; END IF;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'vehicle_model',p_id::text,'Vehicle model updated',jsonb_build_object('brand',v_brand.name,'name',v_name,'active',p_active));
END $$;

CREATE OR REPLACE FUNCTION public.update_vehicle_year(p_old_year integer,p_new_year integer,p_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.require_vehicle_master_manager();
 IF p_new_year IS NULL OR p_new_year<1900 OR p_new_year>2100 THEN RAISE EXCEPTION 'Enter a valid year model'; END IF;
 IF p_new_year<>p_old_year AND EXISTS(SELECT 1 FROM public.vehicle_years WHERE year=p_new_year) THEN RAISE EXCEPTION 'Year model already exists'; END IF;
 UPDATE public.vehicle_years SET year=p_new_year,is_active=coalesce(p_active,true) WHERE year=p_old_year;
 IF NOT FOUND THEN RAISE EXCEPTION 'Year model not found'; END IF;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'vehicle_year',p_new_year::text,'Vehicle year updated',jsonb_build_object('old_year',p_old_year,'new_year',p_new_year,'active',p_active));
END $$;

REVOKE ALL ON FUNCTION private.require_vehicle_master_manager(),public.update_vehicle_brand(uuid,text,boolean),public.update_vehicle_model(uuid,text,text,boolean),public.update_vehicle_year(integer,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.require_vehicle_master_manager(),public.update_vehicle_brand(uuid,text,boolean),public.update_vehicle_model(uuid,text,text,boolean),public.update_vehicle_year(integer,integer,boolean) TO authenticated;

-- New POS RPC retains old behavior and records filterable vehicle attributes.
CREATE OR REPLACE FUNCTION public.create_pos_v2(
 p_id text,p_client text,p_phone text,p_vehicle text,p_vehicle_year text,p_vehicle_brand text,p_vehicle_model text,
 p_plate text,p_concern text,p_items jsonb,p_payments jsonb,p_costs numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;v_total numeric:=0;v_paid numeric:=0;v_vehicle text:=regexp_replace(btrim(coalesce(p_vehicle,'')),'\s+',' ','g');
BEGIN
 PERFORM private.assert_active();
 IF auth.uid() IS NULL OR nullif(trim(p_client),'') IS NULL OR nullif(v_vehicle,'') IS NULL OR p_costs<0 OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_typeof(p_payments)<>'array' THEN RAISE EXCEPTION 'Invalid POS data'; END IF;
 FOR j IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(j->'name')<>'string' OR (j->>'qty')::numeric<=0 OR (j->>'price')::numeric<0 THEN RAISE EXCEPTION 'Invalid POS item'; END IF;
  v_total:=v_total+(j->>'qty')::numeric*(j->>'price')::numeric;
 END LOOP;
 FOR j IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
  IF (j->>'amount')::numeric<=0 OR nullif(j->>'method','') IS NULL THEN RAISE EXCEPTION 'Invalid payment'; END IF;
  v_paid:=v_paid+(j->>'amount')::numeric;
 END LOOP;
 IF v_paid>v_total THEN RAISE EXCEPTION 'Overpayment is not allowed'; END IF;
 INSERT INTO public.pos_accounts(id,actor_id,client,phone,vehicle,vehicle_year,vehicle_brand,vehicle_model,plate,concern,items,payments,costs)
 VALUES(p_id,auth.uid(),btrim(p_client),coalesce(p_phone,''),v_vehicle,nullif(btrim(p_vehicle_year),''),nullif(regexp_replace(btrim(coalesce(p_vehicle_brand,'')),'\s+',' ','g'),''),nullif(regexp_replace(btrim(coalesce(p_vehicle_model,'')),'\s+',' ','g'),''),coalesce(p_plate,''),coalesce(p_concern,''),p_items,p_payments,p_costs);
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'pos',p_id,'POS created as Pending',jsonb_build_object('vehicle_year',p_vehicle_year,'vehicle_brand',p_vehicle_brand,'vehicle_model',p_vehicle_model));
END $$;
REVOKE ALL ON FUNCTION public.create_pos_v2(text,text,text,text,text,text,text,text,text,jsonb,jsonb,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_pos_v2(text,text,text,text,text,text,text,text,text,jsonb,jsonb,numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- Supplier directory. Suppliers are branch-scoped and changes are performed
-- through audited RPCs rather than direct client writes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 name text NOT NULL,
 normalized_name text NOT NULL,
 contact_person text NOT NULL DEFAULT '',
 phone text NOT NULL DEFAULT '',
 email text NOT NULL DEFAULT '',
 category text NOT NULL DEFAULT '',
 lead_time text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT '',
 is_preferred boolean NOT NULL DEFAULT false,
 is_active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(branch_id,normalized_name)
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS suppliers_read ON public.suppliers;
CREATE POLICY suppliers_read ON public.suppliers FOR SELECT TO authenticated USING(private.is_admin() OR branch_id=private.my_branch());
REVOKE ALL ON public.suppliers FROM anon,authenticated;
GRANT SELECT ON public.suppliers TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_supplier(
 p_id uuid,p_name text,p_contact_person text DEFAULT '',p_phone text DEFAULT '',p_email text DEFAULT '',
 p_category text DEFAULT '',p_lead_time text DEFAULT '',p_notes text DEFAULT '',p_is_preferred boolean DEFAULT false,p_is_active boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_branch uuid;v_name text:=regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g');v_norm text;v_id uuid;
BEGIN
 PERFORM private.assert_active();
 SELECT branch_id INTO v_branch FROM public.profiles WHERE id=auth.uid();
 IF v_branch IS NULL THEN RAISE EXCEPTION 'An assigned branch is required to manage suppliers'; END IF;
 IF length(v_name)<2 OR length(v_name)>150 THEN RAISE EXCEPTION 'Supplier name is required'; END IF;
 v_norm:=lower(v_name);
 IF p_id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.suppliers WHERE branch_id=v_branch AND normalized_name=v_norm) THEN RAISE EXCEPTION 'Supplier already exists'; END IF;
  INSERT INTO public.suppliers(branch_id,name,normalized_name,contact_person,phone,email,category,lead_time,notes,is_preferred,is_active,created_by)
  VALUES(v_branch,v_name,v_norm,btrim(coalesce(p_contact_person,'')),btrim(coalesce(p_phone,'')),lower(btrim(coalesce(p_email,''))),btrim(coalesce(p_category,'')),btrim(coalesce(p_lead_time,'')),btrim(coalesce(p_notes,'')),coalesce(p_is_preferred,false),coalesce(p_is_active,true),auth.uid()) RETURNING id INTO v_id;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p_id AND branch_id=v_branch) THEN RAISE EXCEPTION 'Supplier not found for this branch'; END IF;
  IF EXISTS(SELECT 1 FROM public.suppliers WHERE branch_id=v_branch AND normalized_name=v_norm AND id<>p_id) THEN RAISE EXCEPTION 'Supplier already exists'; END IF;
  UPDATE public.suppliers SET name=v_name,normalized_name=v_norm,contact_person=btrim(coalesce(p_contact_person,'')),phone=btrim(coalesce(p_phone,'')),email=lower(btrim(coalesce(p_email,''))),category=btrim(coalesce(p_category,'')),lead_time=btrim(coalesce(p_lead_time,'')),notes=btrim(coalesce(p_notes,'')),is_preferred=coalesce(p_is_preferred,false),is_active=coalesce(p_is_active,true),updated_at=now() WHERE id=p_id RETURNING id INTO v_id;
 END IF;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'supplier',v_id::text,CASE WHEN p_id IS NULL THEN 'Supplier added' ELSE 'Supplier updated' END,jsonb_build_object('name',v_name));
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.set_supplier_active(p_id uuid,p_active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_branch uuid;
BEGIN
 PERFORM private.assert_active();SELECT branch_id INTO v_branch FROM public.profiles WHERE id=auth.uid();
 UPDATE public.suppliers SET is_active=p_active,updated_at=now() WHERE id=p_id AND branch_id=v_branch;
 IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found for this branch'; END IF;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'supplier',p_id::text,CASE WHEN p_active THEN 'Supplier activated' ELSE 'Supplier deactivated' END,'{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.upsert_supplier(uuid,text,text,text,text,text,text,text,boolean,boolean),public.set_supplier_active(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upsert_supplier(uuid,text,text,text,text,text,text,text,boolean,boolean),public.set_supplier_active(uuid,boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Keep legacy BOD/EOD database codes for backward compatibility, but expose
-- clear operational terminology in server errors users actually see.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.require_opening_cash_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='BOD' AND c.business_date=v_day)
 THEN RAISE EXCEPTION 'Complete today''s % Opening Cash Count before posting fund activity',NEW.account; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='EOD' AND c.business_date=v_day) THEN RAISE EXCEPTION 'Today''s Closing Cash Count is already complete. Await the next Opening Cash Count'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='BOD' AND c.business_date=v_day AND abs(c.difference)>0.005)
 AND NOT EXISTS(SELECT 1 FROM public.cash_incident_reports i WHERE i.branch_id=NEW.branch_id AND i.cash_account=NEW.account AND i.incident_type='BOD Discrepancy' AND i.business_date=v_day)
 THEN RAISE EXCEPTION 'Opening Cash Count discrepancy incident report required'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='BOD' AND c.business_date<v_day
 AND NOT EXISTS(SELECT 1 FROM public.daily_cash_counts e WHERE e.branch_id=c.branch_id AND e.cash_account=c.cash_account AND e.business_date=c.business_date AND e.count_type='EOD')
 AND NOT EXISTS(SELECT 1 FROM public.cash_incident_reports i WHERE i.branch_id=c.branch_id AND i.cash_account=c.cash_account AND i.incident_type='Missed EOD' AND i.business_date=c.business_date))
 THEN RAISE EXCEPTION 'Submit all outstanding missed Closing Cash Count incident reports before fund activity'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.submit_daily_count(p_account text,p_type text,p_actual numeric,p_signature text,p_explanation text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_branch uuid;
BEGIN
 PERFORM private.assert_active();SELECT branch_id INTO v_branch FROM public.profiles WHERE id=auth.uid();
 IF p_type='EOD' AND (now() AT TIME ZONE 'Asia/Manila')::time<time '16:00' THEN RAISE EXCEPTION 'Closing Cash Count unlocks at 4:00 PM Philippine time'; END IF;
 IF p_type='BOD' THEN
  IF (now() AT TIME ZONE 'Asia/Manila')::time>=time '09:30' AND NOT EXISTS(SELECT 1 FROM public.cash_incident_reports WHERE branch_id=v_branch AND cash_account=p_account AND incident_type='Late BOD' AND business_date=v_day) THEN RAISE EXCEPTION 'Late Opening Cash Count Incident Report required after 9:30 AM'; END IF;
  IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=v_branch AND c.cash_account=p_account AND c.count_type='BOD' AND c.business_date<v_day AND NOT EXISTS(SELECT 1 FROM public.daily_cash_counts e WHERE e.branch_id=c.branch_id AND e.cash_account=c.cash_account AND e.business_date=c.business_date AND e.count_type='EOD') AND NOT EXISTS(SELECT 1 FROM public.cash_incident_reports i WHERE i.branch_id=c.branch_id AND i.cash_account=c.cash_account AND i.incident_type='Missed EOD' AND i.business_date=c.business_date)) THEN RAISE EXCEPTION 'Submit outstanding missed Closing Cash Count Incident Reports before the Opening Cash Count'; END IF;
 END IF;
 RETURN public.submit_daily_count_internal(p_account,p_type,p_actual,p_signature,p_explanation);
END $$;

CREATE OR REPLACE FUNCTION private.require_funds_bod_for_pos_cash() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_has_cash boolean;
BEGIN
 IF TG_OP='UPDATE' AND NEW.payments IS NOT DISTINCT FROM OLD.payments THEN RETURN NEW; END IF;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.payments,'[]'::jsonb)) v WHERE v->>'method'='Cash') INTO v_has_cash;
 IF NOT v_has_cash THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=NEW.branch_id AND cash_account='Funds' AND count_type='BOD' AND business_date=v_day) THEN RAISE EXCEPTION 'Funds Opening Cash Count is required before accepting a cash payment in POS'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=NEW.branch_id AND cash_account='Funds' AND count_type='EOD' AND business_date=v_day) THEN RAISE EXCEPTION 'Funds Closing Cash Count is already complete; cash payments are locked'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.submit_fund_turnover(p_actual numeric,p_signature text,p_proof text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF extract(isodow FROM (now() AT TIME ZONE 'Asia/Manila')::date)<>5 OR (now() AT TIME ZONE 'Asia/Manila')::time<time '16:00' THEN RAISE EXCEPTION 'Friday Fund Handover unlocks at 4:00 PM Philippine time'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='Cashier' AND is_active=true) THEN RAISE EXCEPTION 'Only assigned Cashiers can submit a Friday Fund Handover'; END IF;
 RETURN public.submit_fund_turnover_internal(p_actual,p_signature,p_proof);
END $$;

REVOKE ALL ON FUNCTION public.submit_daily_count(text,text,numeric,text,text),public.submit_fund_turnover(numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_daily_count(text,text,numeric,text,text),public.submit_fund_turnover(numeric,text,text) TO authenticated;

COMMIT;
