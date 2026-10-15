-- CMS v12 master workflow revision.
-- Run AFTER migration_011_cashier_workflow_polish.sql.
-- Adds role separation, temporary first-login passwords, Sales cash-count workflow,
-- Daily Sales Handover, transaction numbering, Revolving Fund category support,
-- and the detailed Sales data fields used by the operational workbook format.
BEGIN;

-- Roles / first-login security.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('Cashier','PB','HR','Admin','Branch Manager','Super Admin'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;


-- Operational SECURITY DEFINER RPCs remain blocked until the one-time password is replaced.
CREATE OR REPLACE FUNCTION private.assert_active() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_active boolean;v_force boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Account inactive or not signed in'; END IF;
 SELECT is_active,must_change_password INTO v_active,v_force FROM public.profiles WHERE id=auth.uid();
 IF coalesce(v_active,false)=false THEN RAISE EXCEPTION 'Account inactive or not signed in'; END IF;
 IF coalesce(v_force,false)=true THEN RAISE EXCEPTION 'Change the temporary password before using operational modules'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.assert_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.assert_active() TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_first_login() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 UPDATE public.profiles SET must_change_password=false WHERE id=auth.uid();
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'user',auth.uid()::text,'First-login password changed','{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.complete_first_login() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_first_login() TO authenticated;

-- Sequential transaction numbering. Sequence is independent per type and year.
CREATE TABLE IF NOT EXISTS public.transaction_sequences (
 prefix text NOT NULL,
 year integer NOT NULL,
 last_value bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(prefix,year)
);
ALTER TABLE public.transaction_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transaction_sequences FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.next_transaction_number(p_prefix text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_prefix text:=upper(regexp_replace(trim(coalesce(p_prefix,'')),'[^A-Z0-9-]','','g'));v_year integer:=extract(year FROM (now() AT TIME ZONE 'Asia/Manila'))::integer;v_next bigint;
BEGIN
 PERFORM private.assert_active();
 IF v_prefix NOT IN ('POS','RF-EXP','RF-REP','RFP-EXP','RFP-REP','RFP-HO','CC','OCC','CCC','SALES-HO') THEN RAISE EXCEPTION 'Invalid transaction prefix'; END IF;
 INSERT INTO public.transaction_sequences(prefix,year,last_value) VALUES(v_prefix,v_year,1)
 ON CONFLICT(prefix,year) DO UPDATE SET last_value=public.transaction_sequences.last_value+1
 RETURNING last_value INTO v_next;
 RETURN v_prefix||'-'||v_year::text||'-'||lpad(v_next::text,6,'0');
END $$;
REVOKE ALL ON FUNCTION public.next_transaction_number(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.next_transaction_number(text) TO authenticated;

-- Expense categories for Revolving Fund / RFP. Normalized key prevents case/spacing duplicates.
CREATE TABLE IF NOT EXISTS public.expense_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account text NOT NULL CHECK(account IN ('Petty Cash','Funds')),
 name text NOT NULL,
 normalized_name text GENERATED ALWAYS AS (lower(regexp_replace(trim(name),'\s+',' ','g'))) STORED,
 is_active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account,normalized_name)
);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS expense_categories_read ON public.expense_categories;
CREATE POLICY expense_categories_read ON public.expense_categories FOR SELECT TO authenticated USING(true);
REVOKE ALL ON public.expense_categories FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.expense_categories TO authenticated;

INSERT INTO public.expense_categories(account,name) VALUES
('Petty Cash','Transportation'),('Petty Cash','Staff Welfare'),('Petty Cash','General'),('Petty Cash','Gasoline / Fuel'),
('Petty Cash','Office Expense'),('Petty Cash','Client Expense'),('Petty Cash','Repairs & Maintenance'),('Petty Cash','Meals / Food'),
('Petty Cash','Supplies'),('Petty Cash','Courier / Delivery'),('Petty Cash','Government / Documentation Fees'),('Petty Cash','Other Authorized Expense')
ON CONFLICT(account,normalized_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.add_expense_category(p_account text,p_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;v_name text:=regexp_replace(trim(coalesce(p_name,'')),'\s+',' ','g');
BEGIN
 PERFORM private.assert_active();
 IF p_account NOT IN ('Petty Cash','Funds') OR length(v_name)<2 OR length(v_name)>100 THEN RAISE EXCEPTION 'Invalid category'; END IF;
 SELECT id INTO v_id FROM public.expense_categories WHERE account=p_account AND normalized_name=lower(v_name);
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 INSERT INTO public.expense_categories(account,name,created_by) VALUES(p_account,v_name,auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.add_expense_category(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_expense_category(text,text) TO authenticated;


-- Detailed Revolving Fund / RFP activity fields.
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS transaction_date date;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS payee text;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS vat_type text;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS cash_voucher_no text;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS receipt_no text;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS tin_no text;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.cash_transactions DROP CONSTRAINT IF EXISTS cash_transactions_vat_type_check;
ALTER TABLE public.cash_transactions ADD CONSTRAINT cash_transactions_vat_type_check CHECK(vat_type IS NULL OR vat_type IN ('VAT','Non-VAT'));
UPDATE public.cash_transactions SET transaction_date=(created_at AT TIME ZONE 'Asia/Manila')::date WHERE transaction_date IS NULL;
ALTER TABLE public.cash_transactions ALTER COLUMN transaction_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date);

CREATE OR REPLACE FUNCTION public.create_cash_transaction_v2(
 p_id text,p_account text,p_kind text,p_amount numeric,p_category text,p_description text,p_signature text,p_proof text DEFAULT NULL,
 p_transaction_date date DEFAULT NULL,p_payee text DEFAULT '',p_vat_type text DEFAULT '',p_cash_voucher_no text DEFAULT '',
 p_receipt_no text DEFAULT '',p_tin_no text DEFAULT '',p_notes text DEFAULT ''
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_date date:=coalesce(p_transaction_date,(now() AT TIME ZONE 'Asia/Manila')::date);v_vat text:=nullif(btrim(coalesce(p_vat_type,'')),'');
BEGIN
 PERFORM private.assert_active();
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF p_account NOT IN ('Petty Cash','Funds') OR p_kind NOT IN ('Additional Funds','Expense') OR p_amount<=0 OR p_amount>100000000 OR nullif(btrim(p_category),'') IS NULL OR nullif(btrim(p_description),'') IS NULL THEN RAISE EXCEPTION 'Invalid transaction details'; END IF;
 IF v_vat IS NOT NULL AND v_vat NOT IN ('VAT','Non-VAT') THEN RAISE EXCEPTION 'VAT type must be VAT or Non-VAT'; END IF;
 IF p_kind='Expense' AND nullif(btrim(coalesce(p_payee,'')),'') IS NULL THEN RAISE EXCEPTION 'Supplier / Payee is required for an expense'; END IF;
 IF p_signature IS NULL OR split_part(p_signature,'/',1)<>auth.uid()::text THEN RAISE EXCEPTION 'Invalid signature attachment'; END IF;
 IF p_kind='Additional Funds' AND p_proof IS NULL THEN RAISE EXCEPTION 'Replenishment proof is required'; END IF;
 IF p_proof IS NOT NULL AND split_part(p_proof,'/',1)<>auth.uid()::text THEN RAISE EXCEPTION 'Invalid proof attachment'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_signature) THEN RAISE EXCEPTION 'Signature image not found'; END IF;
 IF p_proof IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_proof) THEN RAISE EXCEPTION 'Proof image not found'; END IF;
 INSERT INTO public.cash_transactions(id,account,kind,amount,category,description,actor_id,signature_path,proof_path,transaction_date,payee,vat_type,cash_voucher_no,receipt_no,tin_no,notes)
 VALUES(p_id,p_account,p_kind,p_amount,btrim(p_category),btrim(p_description),auth.uid(),p_signature,p_proof,v_date,nullif(btrim(p_payee),''),v_vat,nullif(btrim(p_cash_voucher_no),''),nullif(btrim(p_receipt_no),''),nullif(btrim(p_tin_no),''),nullif(btrim(p_notes),''));
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'cash',p_id,CASE WHEN p_kind='Expense' THEN 'Expense recorded' ELSE 'Fund replenishment recorded' END,jsonb_build_object('account',p_account,'transaction_date',v_date,'category',p_category,'payee',p_payee,'cash_voucher_no',p_cash_voucher_no));
END $$;
REVOKE ALL ON FUNCTION public.create_cash_transaction_v2(text,text,text,numeric,text,text,text,text,date,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_cash_transaction_v2(text,text,text,numeric,text,text,text,text,date,text,text,text,text,text,text) TO authenticated;

-- Cash-count accounts now distinguish Sales from Revolving Fund and legacy RFP/Funds.
ALTER TABLE public.daily_cash_counts ADD COLUMN IF NOT EXISTS reference_no text UNIQUE;
ALTER TABLE public.fund_turnovers ADD COLUMN IF NOT EXISTS reference_no text UNIQUE;
ALTER TABLE public.daily_cash_counts DROP CONSTRAINT IF EXISTS daily_cash_counts_cash_account_check;
ALTER TABLE public.daily_cash_counts ADD CONSTRAINT daily_cash_counts_cash_account_check CHECK(cash_account IN ('Sales','Petty Cash','Funds'));
ALTER TABLE public.cash_incident_reports DROP CONSTRAINT IF EXISTS cash_incident_reports_cash_account_check;
ALTER TABLE public.cash_incident_reports ADD CONSTRAINT cash_incident_reports_cash_account_check CHECK(cash_account IN ('Sales','Petty Cash','Funds'));

-- Detailed Sales fields based on the business workbook format.
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS bs_si text;
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS customer_tin text;
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS customer_address text;
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS mileage text;
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS service_advisor text;
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS booked_by text;
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS mechanic text;
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS checklist_completed boolean;
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS remarks text;
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS online_expense numeric(14,2) NOT NULL DEFAULT 0 CHECK(online_expense>=0);
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS rf_expense numeric(14,2) NOT NULL DEFAULT 0 CHECK(rf_expense>=0);

-- Rebuild POS creator with the detailed Sales fields. Mixed/partial payments remain JSON-based.
CREATE OR REPLACE FUNCTION public.create_pos_v3(
 p_id text,p_client text,p_phone text,p_vehicle text,p_vehicle_year text,p_vehicle_brand text,p_vehicle_model text,
 p_plate text,p_concern text,p_items jsonb,p_payments jsonb,p_costs numeric,
 p_bs_si text DEFAULT '',p_customer_tin text DEFAULT '',p_customer_address text DEFAULT '',p_mileage text DEFAULT '',
 p_platform text DEFAULT '',p_service_advisor text DEFAULT '',p_booked_by text DEFAULT '',p_mechanic text DEFAULT '',
 p_checklist_completed boolean DEFAULT false,p_remarks text DEFAULT '',p_online_expense numeric DEFAULT 0,p_rf_expense numeric DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;v_total numeric:=0;v_paid numeric:=0;v_vehicle text:=regexp_replace(btrim(coalesce(p_vehicle,'')),'\s+',' ','g');
BEGIN
 PERFORM private.assert_active();
 IF auth.uid() IS NULL OR nullif(trim(p_client),'') IS NULL OR nullif(v_vehicle,'') IS NULL OR p_costs<0 OR coalesce(p_online_expense,0)<0 OR coalesce(p_rf_expense,0)<0 OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)<1 OR jsonb_typeof(p_payments)<>'array' THEN RAISE EXCEPTION 'Invalid POS data'; END IF;
 FOR j IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF nullif(trim(j->>'name'),'') IS NULL OR coalesce(j->>'type','') NOT IN ('Service','Part') OR (j->>'qty')::numeric<=0 OR (j->>'price')::numeric<0 THEN RAISE EXCEPTION 'Invalid quotation item'; END IF;
  v_total:=v_total+(j->>'qty')::numeric*(j->>'price')::numeric;
 END LOOP;
 FOR j IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
  IF (j->>'amount')::numeric<=0 OR nullif(j->>'method','') IS NULL THEN RAISE EXCEPTION 'Invalid payment'; END IF;
  IF j->>'method'<>'Cash' AND nullif(trim(coalesce(j->>'reference','')),'') IS NULL THEN RAISE EXCEPTION 'Payment reference is required for non-cash payments'; END IF;
  IF j->>'method'='Card' AND nullif(trim(coalesce(j->>'cardType','')),'') IS NULL THEN RAISE EXCEPTION 'Card type is required for card payments'; END IF;
  v_paid:=v_paid+(j->>'amount')::numeric;
 END LOOP;
 IF v_paid<=0 THEN RAISE EXCEPTION 'At least one payment is required'; END IF;
 IF v_paid>v_total+0.005 THEN RAISE EXCEPTION 'Overpayment is not allowed'; END IF;
 INSERT INTO public.pos_accounts(id,actor_id,client,phone,vehicle,vehicle_year,vehicle_brand,vehicle_model,plate,concern,items,payments,costs,
  bs_si,customer_tin,customer_address,mileage,platform,service_advisor,booked_by,mechanic,checklist_completed,remarks,online_expense,rf_expense)
 VALUES(p_id,auth.uid(),btrim(p_client),coalesce(p_phone,''),v_vehicle,nullif(btrim(p_vehicle_year),''),nullif(regexp_replace(btrim(coalesce(p_vehicle_brand,'')),'\s+',' ','g'),''),nullif(regexp_replace(btrim(coalesce(p_vehicle_model,'')),'\s+',' ','g'),''),coalesce(p_plate,''),coalesce(p_concern,''),p_items,p_payments,p_costs,
  nullif(btrim(p_bs_si),''),nullif(btrim(p_customer_tin),''),nullif(btrim(p_customer_address),''),nullif(btrim(p_mileage),''),nullif(btrim(p_platform),''),nullif(btrim(p_service_advisor),''),nullif(btrim(p_booked_by),''),nullif(btrim(p_mechanic),''),coalesce(p_checklist_completed,false),nullif(btrim(p_remarks),''),coalesce(p_online_expense,0),coalesce(p_rf_expense,0));
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'pos',p_id,'POS created as Pending',jsonb_build_object('vehicle',v_vehicle,'bs_si',p_bs_si));
END $$;
REVOKE ALL ON FUNCTION public.create_pos_v3(text,text,text,text,text,text,text,text,text,jsonb,jsonb,numeric,text,text,text,text,text,text,text,text,boolean,text,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_pos_v3(text,text,text,text,text,text,text,text,text,jsonb,jsonb,numeric,text,text,text,text,text,text,text,text,boolean,text,numeric,numeric) TO authenticated;

-- Payment v3 stores card type / terminal fee while still supporting mixed and partial payments.
CREATE OR REPLACE FUNCTION public.add_pos_payment_v3(p_id text,p_amount numeric,p_method text,p_reference text DEFAULT '',p_card_type text DEFAULT '',p_terminal_fee numeric DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.pos_accounts%rowtype;due numeric;paid numeric;v_reference text:=btrim(coalesce(p_reference,''));v_card text:=btrim(coalesce(p_card_type,''));v_fee numeric:=coalesce(p_terminal_fee,0);
BEGIN
 PERFORM private.assert_active();
 SELECT * INTO v FROM public.pos_accounts WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'Pending' THEN RAISE EXCEPTION 'POS account is not pending'; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>100000000 OR nullif(trim(p_method),'') IS NULL OR v_fee<0 OR v_fee>p_amount THEN RAISE EXCEPTION 'Invalid payment'; END IF;
 IF p_method<>'Cash' AND nullif(v_reference,'') IS NULL THEN RAISE EXCEPTION 'Payment reference is required for non-cash payments'; END IF;
 IF p_method='Card' AND nullif(v_card,'') IS NULL THEN RAISE EXCEPTION 'Card type is required'; END IF;
 SELECT coalesce(sum((x->>'qty')::numeric*(x->>'price')::numeric),0) INTO due FROM jsonb_array_elements(v.items) x;
 SELECT coalesce(sum((x->>'amount')::numeric),0) INTO paid FROM jsonb_array_elements(v.payments) x;
 IF paid+p_amount>due+0.005 THEN RAISE EXCEPTION 'Overpayment is not allowed'; END IF;
 UPDATE public.pos_accounts SET payments=payments||jsonb_build_array(jsonb_build_object('amount',p_amount,'method',p_method,'reference',v_reference,'cardType',v_card,'terminalFee',v_fee,'at',now())) WHERE id=p_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'pos',p_id,'Additional payment recorded',jsonb_build_object('amount',p_amount,'method',p_method,'reference',v_reference,'card_type',v_card,'terminal_fee',v_fee));
END $$;
REVOKE ALL ON FUNCTION public.add_pos_payment_v3(text,numeric,text,text,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_pos_payment_v3(text,numeric,text,text,text,numeric) TO authenticated;

-- Daily cash-count submission with Sales as a first-class account.
CREATE OR REPLACE FUNCTION public.submit_daily_count(p_account text,p_type text,p_actual numeric,p_signature text,p_explanation text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_branch uuid;v_date date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_clock time:=(now() AT TIME ZONE 'Asia/Manila')::time;v_expected numeric(14,2);v_id uuid;v_prior numeric(14,2);v_role text;v_reference text;
BEGIN
 PERFORM private.assert_active();
 SELECT branch_id,role INTO v_branch,v_role FROM public.profiles WHERE id=auth.uid();
 IF v_branch IS NULL THEN RAISE EXCEPTION 'An assigned branch is required'; END IF;
 IF p_account NOT IN ('Sales','Petty Cash','Funds') OR p_type NOT IN ('BOD','EOD') OR p_actual IS NULL OR p_actual<0 OR p_actual>100000000 THEN RAISE EXCEPTION 'Invalid cash count'; END IF;
 IF v_role='Cashier' AND p_account='Funds' THEN RAISE EXCEPTION 'RFP is managed by PB, not Cashier'; END IF;
 IF v_role='PB' AND p_account<>'Funds' THEN RAISE EXCEPTION 'PB cash counts are limited to RFP'; END IF;
 IF p_type='EOD' AND v_clock<time '16:00' THEN RAISE EXCEPTION 'Closing Cash Count unlocks at 4:00 PM Philippine time'; END IF;
 IF p_signature IS NULL OR split_part(p_signature,'/',1)<>auth.uid()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_signature) THEN RAISE EXCEPTION 'Signature proof required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(v_branch::text||p_account||v_date::text));
 IF p_type='EOD' AND NOT EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=v_branch AND cash_account=p_account AND business_date=v_date AND count_type='BOD') THEN RAISE EXCEPTION 'Opening Cash Count is required before Closing Cash Count'; END IF;
 IF p_type='BOD' THEN
  SELECT expected INTO v_prior FROM public.daily_cash_counts WHERE branch_id=v_branch AND cash_account=p_account AND count_type='EOD' AND business_date<v_date ORDER BY business_date DESC LIMIT 1;
  v_expected:=COALESCE(v_prior,0);
 ELSE
  IF p_account='Sales' THEN
   SELECT COALESCE((SELECT actual FROM public.daily_cash_counts WHERE branch_id=v_branch AND cash_account='Sales' AND count_type='BOD' AND business_date=v_date LIMIT 1),0)
          + COALESCE((SELECT SUM(CASE WHEN payment->>'method'='Cash' THEN coalesce((payment->>'amount')::numeric,0) ELSE 0 END)
                      FROM public.pos_accounts p CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.payments,'[]'::jsonb)) payment
                      WHERE p.branch_id=v_branch AND (p.created_at AT TIME ZONE 'Asia/Manila')::date=v_date),0)
   INTO v_expected;
  ELSIF p_account='Petty Cash' THEN
   SELECT COALESCE(SUM(CASE WHEN kind='Additional Funds' THEN amount ELSE -amount END),0) INTO v_expected FROM public.cash_transactions WHERE account='Petty Cash' AND branch_id=v_branch;
  ELSE
   SELECT COALESCE(SUM(CASE WHEN kind='Additional Funds' THEN amount ELSE -amount END),0) INTO v_expected FROM public.cash_transactions WHERE account='Funds' AND branch_id=v_branch;
  END IF;
 END IF;
 IF abs(p_actual-v_expected)>0.005 AND length(trim(p_explanation))=0 THEN RAISE EXCEPTION 'Discrepancy explanation is required'; END IF;
 v_reference:=public.next_transaction_number(CASE WHEN p_type='BOD' THEN 'OCC' ELSE 'CCC' END);
 INSERT INTO public.daily_cash_counts(branch_id,cash_account,business_date,count_type,expected,actual,actor_id,signature_path,reference_no)
 VALUES(v_branch,p_account,v_date,p_type,v_expected,p_actual,auth.uid(),p_signature,v_reference) RETURNING id INTO v_id;
 IF abs(p_actual-v_expected)>0.005 THEN INSERT INTO public.branch_discrepancies(count_id,branch_id,cashier_id,explanation) VALUES(v_id,v_branch,auth.uid(),p_explanation); END IF;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'daily_count',v_id::text,CASE WHEN p_type='BOD' THEN 'Opening Cash Count submitted' ELSE 'Closing Cash Count submitted' END,jsonb_build_object('account',p_account,'expected',v_expected,'actual',p_actual));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_daily_count(text,text,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_daily_count(text,text,numeric,text,text) TO authenticated;

-- POS cash gating now uses Sales Opening/Closing Cash Count, not RFP.
CREATE OR REPLACE FUNCTION private.require_funds_bod_for_pos_cash() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_clock time:=(now() AT TIME ZONE 'Asia/Manila')::time;v_has_cash boolean;
BEGIN
 IF TG_OP='UPDATE' AND NEW.payments IS NOT DISTINCT FROM OLD.payments THEN RETURN NEW; END IF;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.payments,'[]'::jsonb)) v WHERE v->>'method'='Cash') INTO v_has_cash;
 IF NOT v_has_cash THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=NEW.branch_id AND cash_account='Sales' AND count_type='BOD' AND business_date=v_day) THEN RAISE EXCEPTION 'Sales Opening Cash Count is required before accepting cash payments'; END IF;
 IF v_clock>=time '17:00' AND NOT EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=NEW.branch_id AND cash_account='Sales' AND count_type='EOD' AND business_date=v_day) THEN RAISE EXCEPTION 'Sales Closing Cash Count is required before continuing cashier operations'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=NEW.branch_id AND cash_account='Sales' AND count_type='EOD' AND business_date=v_day) THEN RAISE EXCEPTION 'Sales Closing Cash Count is already complete; cash payments are locked'; END IF;
 RETURN NEW;
END $$;

-- RFP write access belongs to PB; Revolving Fund belongs to Cashier.
CREATE OR REPLACE FUNCTION private.require_opening_cash_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_clock time:=(now() AT TIME ZONE 'Asia/Manila')::time;v_role text;
BEGIN
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
 IF NEW.account='Funds' AND v_role NOT IN ('PB','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'RFP activity is restricted to PB or authorized management'; END IF;
 IF NEW.account='Petty Cash' AND v_role NOT IN ('Cashier','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'Revolving Fund activity is restricted to Cashier or authorized management'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='BOD' AND c.business_date=v_day)
 THEN RAISE EXCEPTION 'Complete today''s Opening Cash Count before posting fund activity'; END IF;
 IF v_clock>=time '17:00' AND NOT EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='EOD' AND c.business_date=v_day)
 THEN RAISE EXCEPTION 'Complete today''s Closing Cash Count before continuing fund activity'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='EOD' AND c.business_date=v_day)
 THEN RAISE EXCEPTION 'Today''s Closing Cash Count is already complete. Await the next Opening Cash Count'; END IF;
 RETURN NEW;
END $$;

-- Daily Sales Handover and shift closure.
CREATE TABLE IF NOT EXISTS public.daily_sales_handovers (
 id text PRIMARY KEY,
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 business_date date NOT NULL,
 cashier_id uuid NOT NULL REFERENCES public.profiles(id),
 gross_sales numeric(14,2) NOT NULL DEFAULT 0,
 cash_sales numeric(14,2) NOT NULL DEFAULT 0,
 card_sales numeric(14,2) NOT NULL DEFAULT 0,
 digital_sales numeric(14,2) NOT NULL DEFAULT 0,
 expected_cash numeric(14,2) NOT NULL DEFAULT 0,
 actual_cash numeric(14,2) NOT NULL DEFAULT 0,
 difference numeric(14,2) NOT NULL DEFAULT 0,
 transaction_count integer NOT NULL DEFAULT 0,
 bs_si_start text,
 bs_si_end text,
 received_by text NOT NULL,
 remarks text,
 signature_path text NOT NULL,
 proof_path text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(branch_id,business_date,cashier_id)
);
ALTER TABLE public.daily_sales_handovers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_sales_handover_read ON public.daily_sales_handovers;
CREATE POLICY daily_sales_handover_read ON public.daily_sales_handovers FOR SELECT TO authenticated USING(private.is_admin() OR branch_id=private.my_branch() OR cashier_id=auth.uid());
REVOKE ALL ON public.daily_sales_handovers FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.daily_sales_handovers TO authenticated;

CREATE TABLE IF NOT EXISTS public.cashier_shift_closures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 business_date date NOT NULL,
 cashier_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(branch_id,business_date,cashier_id)
);
ALTER TABLE public.cashier_shift_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shift_closure_read ON public.cashier_shift_closures;
CREATE POLICY shift_closure_read ON public.cashier_shift_closures FOR SELECT TO authenticated USING(private.is_admin() OR branch_id=private.my_branch() OR cashier_id=auth.uid());
REVOKE ALL ON public.cashier_shift_closures FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cashier_shift_closures TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_daily_sales_handover(p_id text,p_received_by text,p_remarks text,p_signature text,p_proof text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_branch uuid;v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_gross numeric:=0;v_cash numeric:=0;v_card numeric:=0;v_digital numeric:=0;v_expected numeric:=0;v_actual numeric:=0;v_count integer:=0;v_first text;v_last text;
BEGIN
 PERFORM private.assert_active();
 SELECT branch_id INTO v_branch FROM public.profiles WHERE id=auth.uid() AND role='Cashier';
 IF v_branch IS NULL THEN RAISE EXCEPTION 'Assigned Cashier role required'; END IF;
 IF nullif(trim(p_received_by),'') IS NULL THEN RAISE EXCEPTION 'Received By is required'; END IF;
 IF p_signature IS NULL OR split_part(p_signature,'/',1)<>auth.uid()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_signature) THEN RAISE EXCEPTION 'Cashier signature is required'; END IF;
 IF p_proof IS NOT NULL AND split_part(p_proof,'/',1)<>auth.uid()::text THEN RAISE EXCEPTION 'Invalid proof'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=v_branch AND cash_account='Sales' AND business_date=v_day AND count_type='EOD') THEN RAISE EXCEPTION 'Complete Sales Closing Cash Count first'; END IF;
 SELECT coalesce(sum((SELECT coalesce(sum((i->>'qty')::numeric*(i->>'price')::numeric),0) FROM jsonb_array_elements(p.items)i)),0),count(*),min(bs_si),max(bs_si)
 INTO v_gross,v_count,v_first,v_last FROM public.pos_accounts p WHERE p.branch_id=v_branch AND p.status='Closed' AND (p.closed_at AT TIME ZONE 'Asia/Manila')::date=v_day;
 SELECT coalesce(sum(CASE WHEN pay->>'method'='Cash' THEN (pay->>'amount')::numeric ELSE 0 END),0),
        coalesce(sum(CASE WHEN pay->>'method'='Card' THEN (pay->>'amount')::numeric ELSE 0 END),0),
        coalesce(sum(CASE WHEN pay->>'method' IN ('GCash','Maya','Bank Transfer','Cheque','Other') THEN (pay->>'amount')::numeric ELSE 0 END),0)
 INTO v_cash,v_card,v_digital
 FROM public.pos_accounts p CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.payments,'[]'::jsonb)) pay
 WHERE p.branch_id=v_branch AND p.status='Closed' AND (p.closed_at AT TIME ZONE 'Asia/Manila')::date=v_day;
 SELECT expected,actual INTO v_expected,v_actual FROM public.daily_cash_counts WHERE branch_id=v_branch AND cash_account='Sales' AND business_date=v_day AND count_type='EOD' LIMIT 1;
 INSERT INTO public.daily_sales_handovers(id,branch_id,business_date,cashier_id,gross_sales,cash_sales,card_sales,digital_sales,expected_cash,actual_cash,difference,transaction_count,bs_si_start,bs_si_end,received_by,remarks,signature_path,proof_path)
 VALUES(p_id,v_branch,v_day,auth.uid(),v_gross,v_cash,v_card,v_digital,coalesce(v_expected,0),coalesce(v_actual,0),coalesce(v_actual,0)-coalesce(v_expected,0),v_count,v_first,v_last,btrim(p_received_by),nullif(btrim(p_remarks),''),p_signature,p_proof);
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'sales_handover',p_id,'Daily Sales Handover submitted',jsonb_build_object('gross_sales',v_gross,'cash_sales',v_cash,'difference',coalesce(v_actual,0)-coalesce(v_expected,0)));
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_daily_sales_handover(text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_daily_sales_handover(text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_cashier_shift() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_branch uuid;v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_id uuid;
BEGIN
 PERFORM private.assert_active();
 SELECT branch_id INTO v_branch FROM public.profiles WHERE id=auth.uid() AND role='Cashier';
 IF v_branch IS NULL THEN RAISE EXCEPTION 'Assigned Cashier role required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=v_branch AND cash_account='Sales' AND business_date=v_day AND count_type='EOD') THEN RAISE EXCEPTION 'Sales Closing Cash Count is incomplete'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=v_branch AND cash_account='Petty Cash' AND business_date=v_day AND count_type='EOD') THEN RAISE EXCEPTION 'Revolving Fund reconciliation is incomplete'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_sales_handovers WHERE branch_id=v_branch AND business_date=v_day AND cashier_id=auth.uid()) THEN RAISE EXCEPTION 'Daily Sales Handover is incomplete'; END IF;
 INSERT INTO public.cashier_shift_closures(branch_id,business_date,cashier_id) VALUES(v_branch,v_day,auth.uid()) ON CONFLICT(branch_id,business_date,cashier_id) DO UPDATE SET created_at=now() RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'cashier_shift',v_id::text,'Cashier shift closed','{}'::jsonb);
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.close_cashier_shift() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.close_cashier_shift() TO authenticated;

-- RFP Friday handover belongs to PB / authorized management, not Cashier.
CREATE OR REPLACE FUNCTION public.submit_fund_turnover(p_actual numeric,p_signature text,p_proof text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_branch uuid;v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_expected numeric(14,2);v_id uuid;v_reference text;
BEGIN
 PERFORM private.assert_active();
 IF extract(isodow FROM v_day)<>5 OR (now() AT TIME ZONE 'Asia/Manila')::time<time '16:00' THEN RAISE EXCEPTION 'Friday RFP Handover unlocks at 4:00 PM Philippine time'; END IF;
 SELECT branch_id INTO v_branch FROM public.profiles WHERE id=auth.uid() AND role IN ('PB','Admin','Branch Manager','Super Admin') AND is_active=true;
 IF v_branch IS NULL THEN RAISE EXCEPTION 'PB or authorized branch management role required for RFP Handover'; END IF;
 IF p_actual IS NULL OR p_actual<0 THEN RAISE EXCEPTION 'Invalid RFP handover cash count'; END IF;
 IF p_signature IS NULL OR split_part(p_signature,'/',1)<>auth.uid()::text OR p_proof IS NULL OR split_part(p_proof,'/',1)<>auth.uid()::text THEN RAISE EXCEPTION 'Signature and proof are required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_signature) OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_proof) THEN RAISE EXCEPTION 'Handover proof not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(v_branch::text||v_day::text||'rfp-handover'));
 SELECT COALESCE(SUM(CASE WHEN kind='Additional Funds' THEN amount ELSE -amount END),0)
 INTO v_expected FROM public.cash_transactions WHERE account='Funds' AND branch_id=v_branch;
 SELECT v_expected-COALESCE(SUM(actual),0) INTO v_expected FROM public.fund_turnovers WHERE branch_id=v_branch;
 IF p_actual>v_expected+0.005 THEN RAISE EXCEPTION 'Handover cash count exceeds available RFP balance'; END IF;
 v_reference:=public.next_transaction_number('RFP-HO');
 INSERT INTO public.fund_turnovers(branch_id,business_date,expected,actual,cashier_id,cashier_signature,proof_path,reference_no)
 VALUES(v_branch,v_day,v_expected,p_actual,auth.uid(),p_signature,p_proof,v_reference) RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'fund_handover',v_id::text,'Friday RFP Handover submitted',jsonb_build_object('expected',v_expected,'actual',p_actual,'branch',v_branch));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_fund_turnover(numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_fund_turnover(numeric,text,text) TO authenticated;

-- HR compliance read access. HR can inspect completion/incident records without financial write privileges.
CREATE OR REPLACE FUNCTION private.is_hr() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='HR' AND is_active=true)
$$;
REVOKE ALL ON FUNCTION private.is_hr() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.is_hr() TO authenticated;

DROP POLICY IF EXISTS counts_read ON public.daily_cash_counts;
CREATE POLICY counts_read ON public.daily_cash_counts FOR SELECT TO authenticated USING(private.is_admin() OR private.is_hr() OR branch_id=private.my_branch());
DROP POLICY IF EXISTS incidents_read ON public.cash_incident_reports;
CREATE POLICY incidents_read ON public.cash_incident_reports FOR SELECT TO authenticated USING(private.is_admin() OR private.is_hr() OR branch_id=private.my_branch() OR actor_id=auth.uid());
DROP POLICY IF EXISTS daily_sales_handover_read ON public.daily_sales_handovers;
CREATE POLICY daily_sales_handover_read ON public.daily_sales_handovers FOR SELECT TO authenticated USING(private.is_admin() OR private.is_hr() OR branch_id=private.my_branch() OR cashier_id=auth.uid());
DROP POLICY IF EXISTS shift_closure_read ON public.cashier_shift_closures;
CREATE POLICY shift_closure_read ON public.cashier_shift_closures FOR SELECT TO authenticated USING(private.is_admin() OR private.is_hr() OR branch_id=private.my_branch() OR cashier_id=auth.uid());
DROP POLICY IF EXISTS branches_read ON public.branches;
CREATE POLICY branches_read ON public.branches FOR SELECT TO authenticated USING(private.is_admin() OR private.is_hr() OR id=private.my_branch());
DROP POLICY IF EXISTS profile_branch_read ON public.profiles;
CREATE POLICY profile_branch_read ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid() OR private.is_admin() OR private.is_hr() OR branch_id=private.my_branch());

COMMIT;

-- Allow optional phone proof for Daily Sales Handover camera sessions.
ALTER TABLE public.camera_sessions DROP CONSTRAINT IF EXISTS camera_sessions_purpose_check;
ALTER TABLE public.camera_sessions ADD CONSTRAINT camera_sessions_purpose_check CHECK(purpose IN ('fund-handover','expense-receipt','sales-handover'));
