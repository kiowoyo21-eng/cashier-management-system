-- CMS v16: PB RFP dashboard + disbursement/replenishment request workflow.
-- Run AFTER migration_015_sales_turnover_closing_flow.sql.
-- RFP replenishment must originate from an approved/released disbursement request
-- with a compiled supporting PDF containing covered transaction numbers + receipts.
BEGIN;

-- Allow supporting PDFs in the existing private evidence bucket.
UPDATE storage.buckets
SET file_size_limit=26214400,
    allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','application/pdf']
WHERE id='transaction-evidence';

DROP POLICY IF EXISTS evidence_insert ON storage.objects;
CREATE POLICY evidence_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK(
 bucket_id='transaction-evidence'
 AND (storage.foldername(name))[1]=auth.uid()::text
 AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','pdf')
);

-- Management may read evidence belonging to users in the same branch.
DROP POLICY IF EXISTS evidence_read ON storage.objects;
CREATE POLICY evidence_read ON storage.objects
FOR SELECT TO authenticated
USING(
 bucket_id='transaction-evidence'
 AND (
  (storage.foldername(name))[1]=auth.uid()::text
  OR private.is_admin()
  OR EXISTS(
    SELECT 1
    FROM public.profiles viewer
    JOIN public.profiles owner ON owner.id::text=(storage.foldername(name))[1]
    WHERE viewer.id=auth.uid()
      AND viewer.is_active=true
      AND viewer.role='Branch Manager'
      AND viewer.branch_id=owner.branch_id
  )
 )
);

CREATE TABLE IF NOT EXISTS public.rfp_disbursement_requests (
 id text PRIMARY KEY,
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 requested_by uuid NOT NULL REFERENCES public.profiles(id),
 request_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::date),
 period_start date NOT NULL,
 period_end date NOT NULL,
 current_balance numeric(14,2) NOT NULL DEFAULT 0,
 total_expenses numeric(14,2) NOT NULL CHECK(total_expenses>0),
 amount_requested numeric(14,2) NOT NULL CHECK(amount_requested>0),
 expense_count integer NOT NULL CHECK(expense_count>0),
 pdf_path text NOT NULL,
 signature_path text NOT NULL,
 notes text,
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Released','Rejected')),
 reviewed_by uuid REFERENCES public.profiles(id),
 review_note text,
 approved_at timestamptz,
 released_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rfp_disbursement_request_items (
 request_id text NOT NULL REFERENCES public.rfp_disbursement_requests(id) ON DELETE CASCADE,
 expense_id text NOT NULL REFERENCES public.cash_transactions(id),
 amount numeric(14,2) NOT NULL CHECK(amount>0),
 PRIMARY KEY(request_id,expense_id),
 UNIQUE(expense_id)
);

CREATE INDEX IF NOT EXISTS rfp_disbursement_requests_branch_date_idx
ON public.rfp_disbursement_requests(branch_id,created_at DESC);

ALTER TABLE public.rfp_disbursement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfp_disbursement_request_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rfp_disbursement_requests,public.rfp_disbursement_request_items FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.rfp_disbursement_requests,public.rfp_disbursement_request_items TO authenticated;

DROP POLICY IF EXISTS rfp_disbursement_read ON public.rfp_disbursement_requests;
CREATE POLICY rfp_disbursement_read ON public.rfp_disbursement_requests
FOR SELECT TO authenticated
USING(
 private.is_admin()
 OR (private.my_role()='Branch Manager' AND branch_id=private.my_branch())
 OR (private.my_role()='PB' AND branch_id=private.my_branch())
);

DROP POLICY IF EXISTS rfp_disbursement_items_read ON public.rfp_disbursement_request_items;
CREATE POLICY rfp_disbursement_items_read ON public.rfp_disbursement_request_items
FOR SELECT TO authenticated
USING(
 EXISTS(
  SELECT 1 FROM public.rfp_disbursement_requests r
  WHERE r.id=request_id
    AND (
      private.is_admin()
      OR (private.my_role()='Branch Manager' AND r.branch_id=private.my_branch())
      OR (private.my_role()='PB' AND r.branch_id=private.my_branch())
    )
 )
);

-- Add RFP-DR to the protected sequence generator.
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
 IF v_prefix NOT IN ('POS','RF-EXP','RF-REP','RFP-EXP','RFP-REP','RFP-HO','RFP-DR','CC','OCC','CCC','SALES-HO') THEN
  RAISE EXCEPTION 'Invalid transaction prefix';
 END IF;
 IF v_role='Cashier' AND v_prefix NOT IN ('POS','RF-EXP','RF-REP','CC','OCC','CCC','SALES-HO') THEN
  RAISE EXCEPTION 'Cashier transaction number not allowed for this workflow';
 END IF;
 IF v_role='PB' AND v_prefix NOT IN ('RFP-EXP','RFP-HO','RFP-DR','CC','OCC','CCC') THEN
  RAISE EXCEPTION 'PB transaction number not allowed for this workflow';
 END IF;
 IF v_role='HR' THEN RAISE EXCEPTION 'HR reporting access cannot create operational transactions'; END IF;
 INSERT INTO public.transaction_sequences(prefix,year,last_value) VALUES(v_prefix,v_year,1)
 ON CONFLICT(prefix,year) DO UPDATE SET last_value=public.transaction_sequences.last_value+1
 RETURNING last_value INTO v_next;
 RETURN v_prefix||'-'||v_year::text||'-'||lpad(v_next::text,6,'0');
END $$;
REVOKE ALL ON FUNCTION public.next_transaction_number(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.next_transaction_number(text) TO authenticated;

-- RFP replenishment is no longer accepted through the generic fund RPC.
-- It is posted only when an approved disbursement request is released.
CREATE OR REPLACE FUNCTION public.create_cash_transaction_v2(
 p_id text,p_account text,p_kind text,p_amount numeric,p_category text,p_description text,p_signature text,p_proof text DEFAULT NULL,
 p_transaction_date date DEFAULT NULL,p_payee text DEFAULT '',p_vat_type text DEFAULT '',p_cash_voucher_no text DEFAULT '',
 p_receipt_no text DEFAULT '',p_tin_no text DEFAULT '',p_notes text DEFAULT ''
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_date date:=coalesce(p_transaction_date,(now() AT TIME ZONE 'Asia/Manila')::date);v_vat text:=nullif(btrim(coalesce(p_vat_type,'')),'');
BEGIN
 PERFORM private.assert_active();
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF p_account='Funds' AND p_kind='Additional Funds' THEN
  RAISE EXCEPTION 'RFP replenishment requires an approved Disbursement Request with supporting PDF';
 END IF;
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

-- Internal release inserts are marked by a transaction-local flag so normal
-- RFP writes cannot bypass the disbursement workflow.
CREATE OR REPLACE FUNCTION private.cash_role_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;v_branch uuid;v_expected_prefix text;v_release boolean:=coalesce(current_setting('app.rfp_release',true),'')='1';
BEGIN
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role IS NULL THEN RAISE EXCEPTION 'Active account required'; END IF;
 IF NEW.account='Petty Cash' AND v_role NOT IN ('Cashier','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'Revolving Fund is restricted to Cashier or authorized management'; END IF;
 IF NEW.account='Funds' AND v_role NOT IN ('PB','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'RFP is restricted to PB or authorized management'; END IF;
 IF NEW.account='Funds' AND NEW.kind='Additional Funds' AND NOT v_release THEN RAISE EXCEPTION 'RFP replenishment requires a released Disbursement Request'; END IF;
 IF v_role IN ('Cashier','PB','Branch Manager') AND NEW.branch_id IS DISTINCT FROM v_branch THEN RAISE EXCEPTION 'Transaction branch does not match your assigned branch'; END IF;
 v_expected_prefix:=CASE
  WHEN NEW.account='Petty Cash' AND NEW.kind='Expense' THEN 'RF-EXP-'
  WHEN NEW.account='Petty Cash' AND NEW.kind='Additional Funds' THEN 'RF-REP-'
  WHEN NEW.account='Funds' AND NEW.kind='Expense' THEN 'RFP-EXP-'
  WHEN NEW.account='Funds' AND NEW.kind='Additional Funds' THEN 'RFP-REP-'
  ELSE '' END;
 IF v_expected_prefix<>'' AND NEW.id NOT LIKE v_expected_prefix||'%' THEN RAISE EXCEPTION 'Invalid transaction number for this fund activity'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.require_opening_cash_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_clock time:=(now() AT TIME ZONE 'Asia/Manila')::time;v_role text;v_release boolean:=coalesce(current_setting('app.rfp_release',true),'')='1';
BEGIN
 IF v_release THEN RETURN NEW; END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
 IF NEW.account='Funds' AND v_role NOT IN ('PB','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'RFP activity is restricted to PB or authorized management'; END IF;
 IF NEW.account='Petty Cash' AND v_role NOT IN ('Cashier','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'Revolving Fund activity is restricted to Cashier or authorized management'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='BOD' AND c.business_date=v_day) THEN RAISE EXCEPTION 'Complete today''s Opening Cash Count before posting fund activity'; END IF;
 IF v_clock>=time '17:00' AND NOT EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='EOD' AND c.business_date=v_day) THEN RAISE EXCEPTION 'Complete today''s Closing Cash Count before continuing fund activity'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='EOD' AND c.business_date=v_day) THEN RAISE EXCEPTION 'Today''s Closing Cash Count is already complete. Await the next Opening Cash Count'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.submit_rfp_disbursement_request(
 p_id text,
 p_expense_ids text[],
 p_pdf_path text,
 p_signature_path text,
 p_notes text DEFAULT ''
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_branch uuid;v_role text;v_count integer;v_total numeric(14,2);v_start date;v_end date;v_balance numeric(14,2);
BEGIN
 PERFORM private.assert_active();
 SELECT branch_id,role INTO v_branch,v_role FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role NOT IN ('PB','Admin','Branch Manager','Super Admin') OR v_branch IS NULL THEN RAISE EXCEPTION 'PB or authorized management role required'; END IF;
 IF p_id NOT LIKE 'RFP-DR-%' OR coalesce(array_length(p_expense_ids,1),0)=0 THEN RAISE EXCEPTION 'Invalid disbursement request'; END IF;
 IF p_pdf_path IS NULL OR split_part(p_pdf_path,'/',1)<>auth.uid()::text OR lower(storage.extension(p_pdf_path))<>'pdf' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_pdf_path) THEN RAISE EXCEPTION 'Supporting PDF is required'; END IF;
 IF p_signature_path IS NULL OR split_part(p_signature_path,'/',1)<>auth.uid()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_signature_path) THEN RAISE EXCEPTION 'PB signature is required'; END IF;
 IF EXISTS(SELECT 1 FROM public.rfp_disbursement_request_items WHERE expense_id=ANY(p_expense_ids)) THEN RAISE EXCEPTION 'One or more expenses are already included in another disbursement request'; END IF;
 SELECT count(*),coalesce(sum(amount),0),min(transaction_date),max(transaction_date)
 INTO v_count,v_total,v_start,v_end
 FROM public.cash_transactions
 WHERE id=ANY(p_expense_ids) AND account='Funds' AND kind='Expense' AND branch_id=v_branch AND proof_path IS NOT NULL;
 IF v_count<>array_length(p_expense_ids,1) OR v_total<=0 THEN RAISE EXCEPTION 'All covered RFP expenses must belong to your branch and have receipt proof'; END IF;
 SELECT coalesce(sum(CASE WHEN kind='Additional Funds' THEN amount ELSE -amount END),0)
 INTO v_balance FROM public.cash_transactions WHERE account='Funds' AND branch_id=v_branch;
 INSERT INTO public.rfp_disbursement_requests(id,branch_id,requested_by,period_start,period_end,current_balance,total_expenses,amount_requested,expense_count,pdf_path,signature_path,notes)
 VALUES(p_id,v_branch,auth.uid(),coalesce(v_start,(now() AT TIME ZONE 'Asia/Manila')::date),coalesce(v_end,(now() AT TIME ZONE 'Asia/Manila')::date),v_balance,v_total,v_total,v_count,p_pdf_path,p_signature_path,nullif(btrim(coalesce(p_notes,'')),''));
 INSERT INTO public.rfp_disbursement_request_items(request_id,expense_id,amount)
 SELECT p_id,id,amount FROM public.cash_transactions WHERE id=ANY(p_expense_ids);
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'rfp_disbursement',p_id,'RFP Disbursement Request submitted',jsonb_build_object('expense_count',v_count,'amount_requested',v_total,'period_start',v_start,'period_end',v_end));
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_rfp_disbursement_request(text,text[],text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_rfp_disbursement_request(text,text[],text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_rfp_disbursement_request(p_id text,p_action text,p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.rfp_disbursement_requests%rowtype;v_role text;v_branch uuid;v_rep_id text;
BEGIN
 PERFORM private.assert_active();
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role NOT IN ('Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'Management approval required'; END IF;
 SELECT * INTO v FROM public.rfp_disbursement_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Disbursement request not found'; END IF;
 IF v_role='Branch Manager' AND v.branch_id IS DISTINCT FROM v_branch THEN RAISE EXCEPTION 'Request belongs to another branch'; END IF;
 IF p_action='approve' THEN
  IF v.status<>'Pending' THEN RAISE EXCEPTION 'Only Pending requests may be approved'; END IF;
  UPDATE public.rfp_disbursement_requests SET status='Approved',reviewed_by=auth.uid(),review_note=nullif(btrim(coalesce(p_note,'')),''),approved_at=now() WHERE id=p_id;
 ELSIF p_action='reject' THEN
  IF v.status NOT IN ('Pending','Approved') THEN RAISE EXCEPTION 'Request cannot be rejected'; END IF;
  IF nullif(btrim(coalesce(p_note,'')),'') IS NULL THEN RAISE EXCEPTION 'Rejection reason is required'; END IF;
  UPDATE public.rfp_disbursement_requests SET status='Rejected',reviewed_by=auth.uid(),review_note=btrim(p_note) WHERE id=p_id;
  DELETE FROM public.rfp_disbursement_request_items WHERE request_id=p_id;
 ELSIF p_action='release' THEN
  IF v.status<>'Approved' THEN RAISE EXCEPTION 'Approve the disbursement request before release'; END IF;
  PERFORM set_config('app.rfp_release','1',true);
  v_rep_id:=public.next_transaction_number('RFP-REP');
  INSERT INTO public.cash_transactions(
   id,account,kind,amount,category,description,actor_id,signature_path,proof_path,status,branch_id,transaction_date,payee,notes
  ) VALUES(
   v_rep_id,'Funds','Additional Funds',v.amount_requested,'Replenishment',
   'Released RFP Disbursement Request '||v.id,v.requested_by,v.signature_path,v.pdf_path,'Approved',v.branch_id,
   (now() AT TIME ZONE 'Asia/Manila')::date,'RFP Disbursement Release','Source request: '||v.id
  );
  UPDATE public.rfp_disbursement_requests SET status='Released',reviewed_by=auth.uid(),released_at=now() WHERE id=p_id;
 ELSE
  RAISE EXCEPTION 'Invalid review action';
 END IF;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'rfp_disbursement',p_id,'RFP Disbursement '||initcap(p_action),jsonb_build_object('note',p_note,'replenishment_id',v_rep_id));
END $$;
REVOKE ALL ON FUNCTION public.review_rfp_disbursement_request(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_rfp_disbursement_request(text,text,text) TO authenticated;

COMMIT;
