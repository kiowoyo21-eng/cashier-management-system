-- V7.7: RFP Parts/Supplies + formal disbursement verification/approval workflow.
-- Run AFTER migration_018_pb_saved_signature.sql.
BEGIN;

-- Accounting and President are first-class approval roles.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
CHECK (role IN ('Cashier','PB','HR','Accounting','President','Admin','Branch Manager','Super Admin'));

-- Structured RFP expense details used by the disbursement table/PDF.
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS vehicle_unit text;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS plate_number text;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS quantity numeric(12,2) NOT NULL DEFAULT 1;
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS unit_cost numeric(14,2);
UPDATE public.cash_transactions SET unit_cost=amount WHERE unit_cost IS NULL;
ALTER TABLE public.cash_transactions ALTER COLUMN unit_cost SET DEFAULT 0;

-- RFP is strictly Parts and Supplies. Existing unrelated RFP categories are hidden.
UPDATE public.expense_categories SET is_active=false WHERE account='Funds';
INSERT INTO public.expense_categories(account,name,is_active)
VALUES ('Funds','Part',true),('Funds','Supply',true)
ON CONFLICT(account,normalized_name) DO UPDATE SET is_active=true,name=EXCLUDED.name;

CREATE OR REPLACE FUNCTION public.add_expense_category(p_account text,p_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;v_name text:=regexp_replace(trim(coalesce(p_name,'')),'\s+',' ','g');v_role text;
BEGIN
 PERFORM private.assert_active();
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
 IF p_account NOT IN ('Petty Cash','Funds') OR length(v_name)<2 OR length(v_name)>100 THEN RAISE EXCEPTION 'Invalid category'; END IF;
 IF p_account='Funds' THEN
  IF v_role NOT IN ('PB','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'RFP category access required'; END IF;
  IF v_name NOT IN ('Part','Supply') THEN RAISE EXCEPTION 'RFP is limited to Part or Supply expenses'; END IF;
 END IF;
 IF p_account='Petty Cash' AND v_role NOT IN ('Cashier','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'Revolving Fund category access required'; END IF;
 SELECT id INTO v_id FROM public.expense_categories WHERE account=p_account AND normalized_name=lower(v_name);
 IF v_id IS NOT NULL THEN UPDATE public.expense_categories SET is_active=true WHERE id=v_id; RETURN v_id; END IF;
 INSERT INTO public.expense_categories(account,name,created_by) VALUES(p_account,v_name,auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.add_expense_category(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_expense_category(text,text) TO authenticated;

-- Retire legacy RPCs so old clients cannot bypass Parts/Supplies or Accounting/President workflow.
REVOKE EXECUTE ON FUNCTION public.create_cash_transaction_v2(text,text,text,numeric,text,text,text,text,date,text,text,text,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_rfp_disbursement_request(text,text[],text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.review_rfp_disbursement_request(text,text,text) FROM authenticated;

-- New cash RPC adds quantity/unit cost and structured unit/plate remarks.
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
 IF p_account NOT IN ('Petty Cash','Funds') OR p_kind NOT IN ('Additional Funds','Expense') OR p_amount<=0 OR p_amount>100000000 OR nullif(btrim(p_category),'') IS NULL OR nullif(btrim(p_description),'') IS NULL THEN RAISE EXCEPTION 'Invalid transaction details'; END IF;
 IF v_vat IS NOT NULL AND v_vat NOT IN ('VAT','Non-VAT') THEN RAISE EXCEPTION 'VAT type must be VAT or Non-VAT'; END IF;
 IF p_kind='Expense' AND nullif(btrim(coalesce(p_payee,'')),'') IS NULL THEN RAISE EXCEPTION 'Supplier / Payee is required for an expense'; END IF;
 IF p_account='Funds' AND p_kind='Expense' THEN
  IF p_category NOT IN ('Part','Supply') THEN RAISE EXCEPTION 'RFP expenses are limited to Parts and Supplies'; END IF;
  IF p_branch_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_branch_id) THEN RAISE EXCEPTION 'Select the branch that used the part or supply'; END IF;
  IF p_quantity IS NULL OR p_quantity<=0 OR p_unit_cost IS NULL OR p_unit_cost<=0 THEN RAISE EXCEPTION 'RFP quantity and unit cost are required'; END IF;
  IF abs(p_amount-(p_quantity*p_unit_cost))>0.01 THEN RAISE EXCEPTION 'RFP amount must equal quantity multiplied by unit cost'; END IF;
  IF nullif(btrim(coalesce(p_vehicle_unit,'')),'') IS NULL OR nullif(v_plate,'') IS NULL THEN RAISE EXCEPTION 'RFP vehicle/unit and plate number (or NA) are required'; END IF;
 END IF;
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

-- Formal disbursement computation and e-signature fields.
ALTER TABLE public.rfp_disbursement_requests ADD COLUMN IF NOT EXISTS beginning_balance numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.rfp_disbursement_requests ADD COLUMN IF NOT EXISTS remaining_balance numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.rfp_disbursement_requests ADD COLUMN IF NOT EXISTS check_deposit numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.rfp_disbursement_requests ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.rfp_disbursement_requests ADD COLUMN IF NOT EXISTS verified_signature_path text;
ALTER TABLE public.rfp_disbursement_requests ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.rfp_disbursement_requests ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.rfp_disbursement_requests ADD COLUMN IF NOT EXISTS approved_signature_path text;

ALTER TABLE public.rfp_disbursement_requests DROP CONSTRAINT IF EXISTS rfp_disbursement_requests_status_check;
UPDATE public.rfp_disbursement_requests SET status='Pending Verification' WHERE status='Pending';
ALTER TABLE public.rfp_disbursement_requests ADD CONSTRAINT rfp_disbursement_requests_status_check
CHECK(status IN ('Pending Verification','Verified','Approved','Released','Rejected'));
ALTER TABLE public.rfp_disbursement_requests ALTER COLUMN status SET DEFAULT 'Pending Verification';

-- Approval roles can read RFP request metadata and supporting PDFs.
DROP POLICY IF EXISTS rfp_disbursement_read ON public.rfp_disbursement_requests;
CREATE POLICY rfp_disbursement_read ON public.rfp_disbursement_requests FOR SELECT TO authenticated USING(
 private.is_admin()
 OR private.my_role() IN ('Accounting','President')
 OR (private.my_role()='Branch Manager' AND branch_id=private.my_branch())
 OR (private.my_role()='PB' AND branch_id=private.my_branch())
);

DROP POLICY IF EXISTS rfp_disbursement_items_read ON public.rfp_disbursement_request_items;
CREATE POLICY rfp_disbursement_items_read ON public.rfp_disbursement_request_items FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.rfp_disbursement_requests r WHERE r.id=request_id AND (
  private.is_admin() OR private.my_role() IN ('Accounting','President')
  OR (private.my_role()='Branch Manager' AND r.branch_id=private.my_branch())
  OR (private.my_role()='PB' AND r.branch_id=private.my_branch())
 ))
);

DROP POLICY IF EXISTS evidence_read ON storage.objects;
CREATE POLICY evidence_read ON storage.objects FOR SELECT TO authenticated USING(
 bucket_id='transaction-evidence' AND (
  (storage.foldername(name))[1]=auth.uid()::text
  OR private.is_admin()
  OR EXISTS(SELECT 1 FROM public.rfp_disbursement_requests r WHERE name IN (r.pdf_path,r.signature_path,r.verified_signature_path,r.approved_signature_path) AND private.my_role() IN ('Accounting','President'))
  OR EXISTS(
    SELECT 1 FROM public.profiles viewer JOIN public.profiles owner ON owner.id::text=(storage.foldername(name))[1]
    WHERE viewer.id=auth.uid() AND viewer.is_active=true AND viewer.role='Branch Manager' AND viewer.branch_id=owner.branch_id
  )
 )
);

-- Saved e-signatures are available to PB, Accounting, President and authorized management.
CREATE OR REPLACE FUNCTION public.save_my_signature(p_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;
BEGIN
 PERFORM private.assert_active();
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
 IF v_role NOT IN ('PB','Accounting','President','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'Saved signature is not available for this role'; END IF;
 IF p_path IS NULL OR split_part(p_path,'/',1)<>auth.uid()::text THEN RAISE EXCEPTION 'Invalid signature path'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_path) THEN RAISE EXCEPTION 'Saved signature file was not found'; END IF;
 UPDATE public.profiles SET saved_signature_path=p_path WHERE id=auth.uid();
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'profile',auth.uid()::text,'Saved signature updated','{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.save_my_signature(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_my_signature(text) TO authenticated;

-- PB submits a request using the formal Balance - Expenses + Check Deposit computation.
CREATE OR REPLACE FUNCTION public.submit_rfp_disbursement_request_v2(
 p_id text,p_expense_ids text[],p_pdf_path text,p_signature_path text,p_check_deposit numeric DEFAULT 0,p_notes text DEFAULT ''
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_branch uuid;v_role text;v_count integer;v_total numeric(14,2);v_start date;v_end date;v_remaining numeric(14,2);v_beginning numeric(14,2);v_requested numeric(14,2);
BEGIN
 PERFORM private.assert_active();
 SELECT branch_id,role INTO v_branch,v_role FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role NOT IN ('PB','Admin','Branch Manager','Super Admin') OR v_branch IS NULL THEN RAISE EXCEPTION 'PB or authorized management role required'; END IF;
 IF p_id NOT LIKE 'RFP-DR-%' OR coalesce(array_length(p_expense_ids,1),0)=0 OR coalesce(p_check_deposit,0)<0 THEN RAISE EXCEPTION 'Invalid disbursement request'; END IF;
 IF p_pdf_path IS NULL OR split_part(p_pdf_path,'/',1)<>auth.uid()::text OR lower(storage.extension(p_pdf_path))<>'pdf' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_pdf_path) THEN RAISE EXCEPTION 'Supporting PDF is required'; END IF;
 IF p_signature_path IS NULL OR split_part(p_signature_path,'/',1)<>auth.uid()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_signature_path) THEN RAISE EXCEPTION 'PB signature is required'; END IF;
 IF EXISTS(SELECT 1 FROM public.rfp_disbursement_request_items WHERE expense_id=ANY(p_expense_ids)) THEN RAISE EXCEPTION 'One or more expenses are already included in another disbursement request'; END IF;
 SELECT count(*),coalesce(sum(amount),0),min(transaction_date),max(transaction_date)
 INTO v_count,v_total,v_start,v_end FROM public.cash_transactions
 WHERE id=ANY(p_expense_ids) AND account='Funds' AND kind='Expense' AND proof_path IS NOT NULL AND category IN ('Part','Supply') AND quantity>0 AND unit_cost>0;
 IF v_count<>array_length(p_expense_ids,1) OR v_total<=0 THEN RAISE EXCEPTION 'All covered RFP expenses must be Parts/Supplies with receipt proof and item details'; END IF;
 IF p_check_deposit>v_total THEN RAISE EXCEPTION 'Check Deposit cannot exceed covered expenses'; END IF;
 SELECT coalesce(sum(CASE WHEN kind='Additional Funds' THEN amount ELSE -amount END),0) INTO v_remaining FROM public.cash_transactions WHERE account='Funds';
 v_beginning:=v_remaining+v_total;
 v_requested:=v_beginning-(v_remaining+p_check_deposit);
 IF v_requested<=0 THEN RAISE EXCEPTION 'No disbursement amount remains after Check Deposit'; END IF;
 INSERT INTO public.rfp_disbursement_requests(id,branch_id,requested_by,period_start,period_end,current_balance,beginning_balance,remaining_balance,check_deposit,total_expenses,amount_requested,expense_count,pdf_path,signature_path,notes,status)
 VALUES(p_id,v_branch,auth.uid(),coalesce(v_start,(now() AT TIME ZONE 'Asia/Manila')::date),coalesce(v_end,(now() AT TIME ZONE 'Asia/Manila')::date),v_remaining,v_beginning,v_remaining,p_check_deposit,v_total,v_requested,v_count,p_pdf_path,p_signature_path,nullif(btrim(coalesce(p_notes,'')),''),'Pending Verification');
 INSERT INTO public.rfp_disbursement_request_items(request_id,expense_id,amount) SELECT p_id,id,amount FROM public.cash_transactions WHERE id=ANY(p_expense_ids);
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'rfp_disbursement',p_id,'RFP Disbursement submitted to Accounting',jsonb_build_object('expense_count',v_count,'total_expenses',v_total,'check_deposit',p_check_deposit,'amount_requested',v_requested));
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_rfp_disbursement_request_v2(text,text[],text,text,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_rfp_disbursement_request_v2(text,text[],text,text,numeric,text) TO authenticated;

-- Transaction sequence permissions include Accounting release posting.
CREATE OR REPLACE FUNCTION public.next_transaction_number(p_prefix text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_prefix text:=upper(regexp_replace(trim(coalesce(p_prefix,'')),'[^A-Z0-9-]','','g'));v_year integer:=extract(year FROM (now() AT TIME ZONE 'Asia/Manila'))::integer;v_next bigint;v_role text;
BEGIN
 PERFORM private.assert_active();SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
 IF v_prefix NOT IN ('POS','RF-EXP','RF-REP','RFP-EXP','RFP-REP','RFP-DR','CC','OCC','CCC','SALES-HO') THEN RAISE EXCEPTION 'Invalid transaction prefix'; END IF;
 IF v_role='Cashier' AND v_prefix NOT IN ('POS','RF-EXP','RF-REP','CC','OCC','CCC','SALES-HO') THEN RAISE EXCEPTION 'Cashier transaction number not allowed for this workflow'; END IF;
 IF v_role='PB' AND v_prefix NOT IN ('RFP-EXP','RFP-DR') THEN RAISE EXCEPTION 'PB transaction number not allowed for this workflow'; END IF;
 IF v_role='Accounting' AND v_prefix<>'RFP-REP' THEN RAISE EXCEPTION 'Accounting transaction number not allowed for this workflow'; END IF;
 IF v_role IN ('HR','President') THEN RAISE EXCEPTION 'This role cannot create operational transaction numbers'; END IF;
 INSERT INTO public.transaction_sequences(prefix,year,last_value) VALUES(v_prefix,v_year,1)
 ON CONFLICT(prefix,year) DO UPDATE SET last_value=public.transaction_sequences.last_value+1 RETURNING last_value INTO v_next;
 RETURN v_prefix||'-'||v_year::text||'-'||lpad(v_next::text,6,'0');
END $$;
REVOKE ALL ON FUNCTION public.next_transaction_number(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.next_transaction_number(text) TO authenticated;

-- PB may assign an RFP expense to the branch that actually used the Part/Supply.
CREATE OR REPLACE FUNCTION private.assign_finance_branch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;v_branch uuid;v_release boolean:=coalesce(current_setting('app.rfp_release',true),'')='1';
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authenticated account required'; END IF;
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active;
 IF TG_TABLE_NAME='cash_transactions' AND NEW.account='Funds' AND NEW.branch_id IS NOT NULL AND (v_role='PB' OR (v_role='Accounting' AND v_release)) THEN
  IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id=NEW.branch_id) THEN RAISE EXCEPTION 'Unknown RFP branch'; END IF;
  RETURN NEW;
 END IF;
 NEW.branch_id:=v_branch;
 IF NEW.branch_id IS NULL THEN RAISE EXCEPTION 'Assign a branch before recording transactions'; END IF;
 RETURN NEW;
END $$;

DROP POLICY IF EXISTS cash_read ON public.cash_transactions;
CREATE POLICY cash_read ON public.cash_transactions FOR SELECT TO authenticated USING(
 private.is_admin()
 OR (private.my_role()='Branch Manager' AND branch_id=private.my_branch())
 OR (private.my_role()='Cashier' AND branch_id=private.my_branch() AND account='Petty Cash')
 OR (private.my_role()='PB' AND account='Funds')
);

DROP POLICY IF EXISTS branches_read ON public.branches;
CREATE POLICY branches_read ON public.branches FOR SELECT TO authenticated USING(
 private.is_admin() OR private.is_hr() OR private.my_role() IN ('PB','Accounting','President') OR id=private.my_branch()
);

-- Release insert may be executed by Accounting after President approval.
CREATE OR REPLACE FUNCTION private.cash_role_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;v_branch uuid;v_expected_prefix text;v_release boolean:=coalesce(current_setting('app.rfp_release',true),'')='1';
BEGIN
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role IS NULL THEN RAISE EXCEPTION 'Active account required'; END IF;
 IF NEW.account='Petty Cash' AND v_role NOT IN ('Cashier','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'Revolving Fund is restricted to Cashier or authorized management'; END IF;
 IF NEW.account='Funds' AND NOT (v_role IN ('PB','Admin','Branch Manager','Super Admin') OR (v_release AND v_role='Accounting')) THEN RAISE EXCEPTION 'RFP is restricted to PB or authorized RFP workflow roles'; END IF;
 IF NEW.account='Funds' AND NEW.kind='Additional Funds' AND NOT v_release THEN RAISE EXCEPTION 'RFP replenishment requires a released Disbursement Request'; END IF;
 IF v_role IN ('Cashier','Branch Manager') AND NEW.branch_id IS DISTINCT FROM v_branch THEN RAISE EXCEPTION 'Transaction branch does not match your assigned branch'; END IF;
 v_expected_prefix:=CASE WHEN NEW.account='Petty Cash' AND NEW.kind='Expense' THEN 'RF-EXP-' WHEN NEW.account='Petty Cash' AND NEW.kind='Additional Funds' THEN 'RF-REP-' WHEN NEW.account='Funds' AND NEW.kind='Expense' THEN 'RFP-EXP-' WHEN NEW.account='Funds' AND NEW.kind='Additional Funds' THEN 'RFP-REP-' ELSE '' END;
 IF v_expected_prefix<>'' AND NEW.id NOT LIKE v_expected_prefix||'%' THEN RAISE EXCEPTION 'Invalid transaction number for this fund activity'; END IF;
 RETURN NEW;
END $$;

-- Accounting verifies, President approves with e-signature, Accounting releases.
CREATE OR REPLACE FUNCTION public.review_rfp_disbursement_request_v2(p_id text,p_action text,p_signature_path text DEFAULT NULL,p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.rfp_disbursement_requests%rowtype;v_role text;v_rep_id text;
BEGIN
 PERFORM private.assert_active();SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 SELECT * INTO v FROM public.rfp_disbursement_requests WHERE id=p_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Disbursement request not found'; END IF;
 IF p_action IN ('verify','approve') THEN
  IF p_signature_path IS NULL OR split_part(p_signature_path,'/',1)<>auth.uid()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_signature_path) THEN RAISE EXCEPTION 'Valid e-signature is required'; END IF;
 END IF;
 IF p_action='verify' THEN
  IF v_role NOT IN ('Accounting','Admin','Super Admin') THEN RAISE EXCEPTION 'Accounting verification required'; END IF;
  IF v.status<>'Pending Verification' THEN RAISE EXCEPTION 'Only Pending Verification requests may be verified'; END IF;
  UPDATE public.rfp_disbursement_requests SET status='Verified',verified_by=auth.uid(),verified_signature_path=p_signature_path,verified_at=now(),review_note=nullif(btrim(coalesce(p_note,'')),'') WHERE id=p_id;
 ELSIF p_action='approve' THEN
  IF v_role NOT IN ('President','Admin','Super Admin') THEN RAISE EXCEPTION 'President approval required'; END IF;
  IF v.status<>'Verified' THEN RAISE EXCEPTION 'Accounting must verify the request before President approval'; END IF;
  UPDATE public.rfp_disbursement_requests SET status='Approved',approved_by=auth.uid(),approved_signature_path=p_signature_path,approved_at=now(),review_note=coalesce(nullif(btrim(coalesce(p_note,'')),''),review_note) WHERE id=p_id;
 ELSIF p_action='reject' THEN
  IF v_role NOT IN ('Accounting','President','Admin','Super Admin') THEN RAISE EXCEPTION 'Approval role required'; END IF;
  IF v.status NOT IN ('Pending Verification','Verified','Approved') THEN RAISE EXCEPTION 'Request cannot be returned'; END IF;
  IF nullif(btrim(coalesce(p_note,'')),'') IS NULL THEN RAISE EXCEPTION 'Return / rejection reason is required'; END IF;
  UPDATE public.rfp_disbursement_requests SET status='Rejected',review_note=btrim(p_note) WHERE id=p_id;
  DELETE FROM public.rfp_disbursement_request_items WHERE request_id=p_id;
 ELSIF p_action='release' THEN
  IF v_role NOT IN ('Accounting','Admin','Super Admin') THEN RAISE EXCEPTION 'Accounting release required'; END IF;
  IF v.status<>'Approved' THEN RAISE EXCEPTION 'President approval is required before release'; END IF;
  PERFORM set_config('app.rfp_release','1',true);v_rep_id:=public.next_transaction_number('RFP-REP');
  INSERT INTO public.cash_transactions(id,account,kind,amount,category,description,actor_id,signature_path,proof_path,status,branch_id,transaction_date,payee,notes,quantity,unit_cost)
  VALUES(v_rep_id,'Funds','Additional Funds',v.amount_requested,'Replenishment','Released RFP Disbursement Request '||v.id,v.requested_by,v.signature_path,v.pdf_path,'Approved',v.branch_id,(now() AT TIME ZONE 'Asia/Manila')::date,'RFP Disbursement Release','Source request: '||v.id,1,v.amount_requested);
  UPDATE public.rfp_disbursement_requests SET status='Released',released_at=now() WHERE id=p_id;
 ELSE RAISE EXCEPTION 'Invalid review action'; END IF;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'rfp_disbursement',p_id,'RFP Disbursement '||initcap(p_action),jsonb_build_object('note',p_note,'replenishment_id',v_rep_id));
END $$;
REVOKE ALL ON FUNCTION public.review_rfp_disbursement_request_v2(text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_rfp_disbursement_request_v2(text,text,text,text) TO authenticated;

-- Accounting/President can read basic profile names needed for approval display.
DROP POLICY IF EXISTS profile_branch_read ON public.profiles;
CREATE POLICY profile_branch_read ON public.profiles FOR SELECT TO authenticated USING(
 id=auth.uid() OR private.is_admin() OR private.is_hr() OR private.my_role() IN ('Accounting','President') OR branch_id=private.my_branch()
);

COMMIT;
