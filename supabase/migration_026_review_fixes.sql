-- Review #001-#005: consolidated, idempotent migration.
-- Run AFTER migration_024. migration_025 is optional: this migration also installs its missing table/functions.
-- Take a database backup first. Run once in the Supabase SQL Editor and check for errors.
BEGIN;

-- Ensure the edit-request feature works even if migration_025 was never applied.
CREATE TABLE IF NOT EXISTS public.rfp_edit_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cash_id text NOT NULL REFERENCES public.cash_transactions(id),
 requested_by uuid NOT NULL REFERENCES public.profiles(id),
 original_branch_id uuid REFERENCES public.branches(id),
 proposed_branch_id uuid REFERENCES public.branches(id),
 old_values jsonb NOT NULL,
 proposed jsonb NOT NULL,
 reason text NOT NULL,
 status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected')),
 reviewer_id uuid REFERENCES public.profiles(id),
 reviewer_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS rfp_one_pending_edit ON public.rfp_edit_requests(cash_id) WHERE status='Pending';
ALTER TABLE public.rfp_edit_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rfp_edit_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rfp_edit_requests TO authenticated;
DROP POLICY IF EXISTS rfp_edit_read ON public.rfp_edit_requests;
CREATE POLICY rfp_edit_read ON public.rfp_edit_requests FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.id=auth.uid() AND pr.is_active AND (
 pr.role IN ('Admin','Super Admin') OR
 (pr.role='PB' AND rfp_edit_requests.requested_by=auth.uid()) OR
 (pr.role='Branch Manager' AND pr.branch_id IN (rfp_edit_requests.original_branch_id,rfp_edit_requests.proposed_branch_id))
 ))
);

-- Admin can inspect the audit history of edits (Super Admin retains access).
DROP POLICY IF EXISTS audit_super ON public.audit_logs;
DROP POLICY IF EXISTS audit_admin_review ON public.audit_logs;
CREATE POLICY audit_admin_review ON public.audit_logs FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active=true AND p.role IN ('Admin','Super Admin'))
);

-- PB can load supporting images attached to authorized RFP transactions, even when
-- another staff account originally uploaded them. Other unrelated private files stay private.
DROP POLICY IF EXISTS evidence_read ON storage.objects;
CREATE POLICY evidence_read ON storage.objects FOR SELECT TO authenticated USING(
 bucket_id='transaction-evidence' AND (
  (storage.foldername(name))[1]=auth.uid()::text OR private.is_admin()
  OR EXISTS (SELECT 1 FROM public.rfp_disbursement_requests r
    WHERE name IN (r.pdf_path,r.receipts_pdf_path,r.signature_path,r.verified_signature_path,r.approved_signature_path)
    AND private.my_role() IN ('Accounting','President'))
  OR EXISTS (SELECT 1 FROM public.profiles viewer
      JOIN public.profiles owner ON owner.id::text=(storage.foldername(name))[1]
      WHERE viewer.id=auth.uid() AND viewer.is_active=true AND viewer.role='Branch Manager'
      AND viewer.branch_id=owner.branch_id)
  OR (private.my_role()='PB' AND EXISTS(SELECT 1 FROM public.cash_transactions c
      WHERE c.account='Funds' AND name IN (c.proof_path,c.signature_path)))
 )
);

-- Hide old category choices without erasing existing financial history.
UPDATE public.expense_categories SET is_active=false WHERE account='Funds' AND name<>'Part';
INSERT INTO public.expense_categories(account,name,is_active)
VALUES ('Funds','Part',true)
ON CONFLICT(account,normalized_name) DO UPDATE SET name='Part',is_active=true;

-- Reject any new RFP non-Part expense and any future reclassification to a non-Part expense.
-- Historical rows are not deleted or rewritten.
CREATE OR REPLACE FUNCTION private.rfp_parts_only_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.account='Funds' AND NEW.kind='Expense' AND NEW.category IS DISTINCT FROM 'Part' THEN
  RAISE EXCEPTION 'RFP expenses are for Parts only. Other categories belong under Revolving Fund';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_rfp_parts_only_insert ON public.cash_transactions;
CREATE TRIGGER zz_rfp_parts_only_insert BEFORE INSERT OR UPDATE OF account,kind,category
ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION private.rfp_parts_only_guard();

-- The older expense-category RPC allowed Supply. Enforce Parts-only in SQL too.
CREATE OR REPLACE FUNCTION public.add_expense_category(p_account text,p_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;v_name text:=regexp_replace(trim(coalesce(p_name,'')),'\s+',' ','g');v_role text;
BEGIN
 PERFORM private.assert_active();
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
 IF p_account NOT IN ('Petty Cash','Funds') OR length(v_name)<2 OR length(v_name)>100 THEN RAISE EXCEPTION 'Invalid category'; END IF;
 IF p_account='Funds' THEN
  IF v_role NOT IN ('PB','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'RFP category access required'; END IF;
  IF v_name <> 'Part' THEN RAISE EXCEPTION 'Only Part is allowed in RFP'; END IF;
 ELSE
  IF v_role NOT IN ('Cashier','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'Revolving Fund category access required'; END IF;
 END IF;
 SELECT id INTO v_id FROM public.expense_categories WHERE account=p_account AND normalized_name=lower(v_name);
 IF v_id IS NOT NULL THEN UPDATE public.expense_categories SET is_active=true WHERE id=v_id;RETURN v_id;END IF;
 INSERT INTO public.expense_categories(account,name,created_by) VALUES(p_account,v_name,auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.add_expense_category(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_expense_category(text,text) TO authenticated;

-- PB submits a correction, Branch Manager/Admin approves. The four names match migration_020.
CREATE OR REPLACE FUNCTION public.request_rfp_edit(p_cash_id text,p_reason text,p_proposed jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cash_transactions%ROWTYPE;v_role text;v_branch uuid;v_dest uuid;v_qty numeric;v_cost numeric;v_id uuid;
 v_allowed text[]:=ARRAY['description','payee','plate_number','vehicle_unit','quantity','unit_cost','branch_id'];
BEGIN
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active;
 IF v_role IS DISTINCT FROM 'PB' THEN RAISE EXCEPTION 'Only PB may request RFP corrections'; END IF;
 SELECT * INTO c FROM public.cash_transactions WHERE id=p_cash_id FOR UPDATE;
 IF NOT FOUND OR c.account<>'Funds' OR c.kind<>'Expense' OR c.category<>'Part' THEN RAISE EXCEPTION 'RFP Parts expense required'; END IF;
 IF v_branch IS NOT NULL AND c.branch_id IS DISTINCT FROM v_branch THEN RAISE EXCEPTION 'Cannot edit another branch'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'Reason must be at least 10 characters'; END IF;
 IF p_proposed IS NULL OR jsonb_typeof(p_proposed)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_proposed) x WHERE NOT x=ANY(v_allowed)) THEN RAISE EXCEPTION 'Unsupported correction fields'; END IF;
 IF NULLIF(p_proposed->>'branch_id','') IS NULL THEN RAISE EXCEPTION 'Select a branch'; END IF;
 v_dest:=(p_proposed->>'branch_id')::uuid;
 IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id=v_dest AND name IN
  ('Mastermind Mandaluyong','Underchargers Mandaluyong','Underchargers Las Piñas','Underchargers Quezon City')) THEN RAISE EXCEPTION 'Invalid destination branch'; END IF;
 IF length(btrim(coalesce(p_proposed->>'description','')))=0 OR length(btrim(coalesce(p_proposed->>'plate_number','')))=0
    OR length(btrim(coalesce(p_proposed->>'payee','')))=0 OR length(btrim(coalesce(p_proposed->>'vehicle_unit','')))=0 THEN RAISE EXCEPTION 'Part, plate, unit and supplier are required'; END IF;
 v_qty:=(p_proposed->>'quantity')::numeric;v_cost:=(p_proposed->>'unit_cost')::numeric;
 IF v_qty IS NULL OR v_cost IS NULL OR v_qty<=0 OR v_cost<=0 OR round(v_qty*v_cost,2)>100000000 THEN RAISE EXCEPTION 'Invalid quantity or unit cost'; END IF;
 IF EXISTS(SELECT 1 FROM public.rfp_part_pos_links WHERE cash_transaction_id=p_cash_id) AND
 (v_dest IS DISTINCT FROM c.branch_id OR upper(regexp_replace(p_proposed->>'plate_number','[^A-Za-z0-9]','','g')) IS DISTINCT FROM upper(regexp_replace(coalesce(c.plate_number,''),'[^A-Za-z0-9]','','g'))) THEN
  RAISE EXCEPTION 'Part linked to POS: branch and plate cannot change without unlinking/reconciling'; END IF;
 IF round(v_qty*v_cost,2) IS DISTINCT FROM c.amount AND EXISTS(SELECT 1 FROM public.rfp_disbursement_request_items WHERE expense_id=c.id) THEN
  RAISE EXCEPTION 'Amount already covered by disbursement; reconcile its report before changing the amount'; END IF;
 INSERT INTO public.rfp_edit_requests(cash_id,requested_by,original_branch_id,proposed_branch_id,old_values,proposed,reason)
 VALUES (p_cash_id,auth.uid(),c.branch_id,v_dest,
 jsonb_build_object('amount',c.amount,'description',c.description,'payee',c.payee,'plate_number',c.plate_number,'vehicle_unit',c.vehicle_unit,'quantity',c.quantity,'unit_cost',c.unit_cost,'branch_id',c.branch_id),p_proposed,btrim(p_reason)) RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'rfp_edit_request',v_id::text,'PB requested RFP edit',jsonb_build_object('cash_id',p_cash_id,'reason',p_reason,'before',jsonb_build_object('amount',c.amount,'description',c.description,'payee',c.payee,'plate_number',c.plate_number,'vehicle_unit',c.vehicle_unit,'quantity',c.quantity,'unit_cost',c.unit_cost,'branch_id',c.branch_id),'proposed',p_proposed));
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.review_rfp_edit(p_request_id uuid,p_action text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.rfp_edit_requests%ROWTYPE;c public.cash_transactions%ROWTYPE;v_role text;v_branch uuid;v_qty numeric;v_cost numeric;
 v_before jsonb;v_after jsonb;
BEGIN
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active;
 IF v_role NOT IN ('Branch Manager','Admin','Super Admin') OR v_role IS NULL THEN RAISE EXCEPTION 'Authorized reviewer required'; END IF;
 IF p_action NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 SELECT * INTO r FROM public.rfp_edit_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'Pending' THEN RAISE EXCEPTION 'Pending request required'; END IF;
 IF v_role='Branch Manager' AND v_branch IS DISTINCT FROM r.original_branch_id THEN RAISE EXCEPTION 'Original branch manager approval required'; END IF;
 SELECT * INTO c FROM public.cash_transactions WHERE id=r.cash_id FOR UPDATE;
 IF NOT FOUND OR c.account<>'Funds' OR c.kind<>'Expense' OR c.category<>'Part' THEN RAISE EXCEPTION 'Source Parts expense missing'; END IF;
 v_before:=jsonb_build_object('amount',c.amount,'description',c.description,'payee',c.payee,'plate_number',c.plate_number,'vehicle_unit',c.vehicle_unit,'quantity',c.quantity,'unit_cost',c.unit_cost,'branch_id',c.branch_id);
 IF p_action='approve' THEN
  IF v_before IS DISTINCT FROM r.old_values THEN RAISE EXCEPTION 'Expense changed since request; submit a new correction'; END IF;
  IF r.proposed_branch_id IS DISTINCT FROM r.original_branch_id AND v_role='Branch Manager' THEN RAISE EXCEPTION 'Cross-branch transfers require Admin/Super Admin'; END IF;
  IF EXISTS(SELECT 1 FROM public.rfp_part_pos_links WHERE cash_transaction_id=c.id) AND
   (r.proposed_branch_id IS DISTINCT FROM c.branch_id OR upper(regexp_replace(r.proposed->>'plate_number','[^A-Za-z0-9]','','g')) IS DISTINCT FROM upper(regexp_replace(coalesce(c.plate_number,''),'[^A-Za-z0-9]','','g'))) THEN RAISE EXCEPTION 'Linked POS cannot be reassigned'; END IF;
  v_qty:=(r.proposed->>'quantity')::numeric;v_cost:=(r.proposed->>'unit_cost')::numeric;
  IF v_qty IS NULL OR v_cost IS NULL OR v_qty<=0 OR v_cost<=0 OR round(v_qty*v_cost,2)>100000000 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF round(v_qty*v_cost,2) IS DISTINCT FROM c.amount AND EXISTS(SELECT 1 FROM public.rfp_disbursement_request_items WHERE expense_id=c.id) THEN
   RAISE EXCEPTION 'This expense is included in a disbursement; reconcile the report before changing its amount'; END IF;
  UPDATE public.cash_transactions SET description=r.proposed->>'description',payee=r.proposed->>'payee',plate_number=upper(regexp_replace(r.proposed->>'plate_number','[^A-Za-z0-9]','','g')),
   vehicle_unit=r.proposed->>'vehicle_unit',quantity=v_qty,unit_cost=v_cost,amount=round(v_qty*v_cost,2),branch_id=r.proposed_branch_id WHERE id=c.id;
  SELECT jsonb_build_object('amount',amount,'description',description,'payee',payee,'plate_number',plate_number,'vehicle_unit',vehicle_unit,'quantity',quantity,'unit_cost',unit_cost,'branch_id',branch_id)
   INTO v_after FROM public.cash_transactions WHERE id=c.id;
 END IF;
 UPDATE public.rfp_edit_requests SET status=CASE WHEN p_action='approve' THEN 'Approved' ELSE 'Rejected' END,
 reviewer_id=auth.uid(),reviewer_note=p_note,reviewed_at=now() WHERE id=r.id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'rfp_edit_request',r.id::text,'RFP correction '||p_action,jsonb_build_object('cash_id',r.cash_id,'before',v_before,'after',v_after,'reason',r.reason,'review_note',p_note));
 IF p_action='approve' THEN
  INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
  VALUES(auth.uid(),'cash',r.cash_id,'RFP edit approved',jsonb_build_object('request_id',r.id,'before',v_before,'after',v_after,'reason',r.reason));
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.request_rfp_edit(text,text,jsonb),public.review_rfp_edit(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_rfp_edit(text,text,jsonb),public.review_rfp_edit(uuid,text,text) TO authenticated;

-- All NEW disbursement items must be for Parts only, including legacy Supply rows
-- that predate the Parts-only cash trigger. Existing request history is preserved.
CREATE OR REPLACE FUNCTION private.rfp_disbursement_part_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cash_transactions c WHERE c.id=NEW.expense_id
    AND c.account='Funds' AND c.kind='Expense' AND c.category='Part') THEN
  RAISE EXCEPTION 'RFP Disbursement accepts Parts expenses only';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_disbursement_parts_only ON public.rfp_disbursement_request_items;
CREATE TRIGGER zz_disbursement_parts_only BEFORE INSERT OR UPDATE OF expense_id
 ON public.rfp_disbursement_request_items FOR EACH ROW EXECUTE FUNCTION private.rfp_disbursement_part_guard();

-- Only actual Admin and Super Admin may directly correct financial transactions.
-- All monetary updates happen atomically in SQL and write a full before/after audit record.
CREATE OR REPLACE FUNCTION public.admin_edit_cash(p_id text,p_patch jsonb,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cash_transactions%ROWTYPE;n public.cash_transactions%ROWTYPE;v_role text;
 v_allowed text[]:=ARRAY['amount','category','description','transaction_date','payee','vat_type','cash_voucher_no','receipt_no','tin_no','notes','vehicle_unit','plate_number','quantity','unit_cost','branch_id'];
BEGIN
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role NOT IN ('Admin','Super Admin') OR v_role IS NULL THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Edit reason must contain at least 5 characters'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb OR
  EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE NOT k=ANY(v_allowed)) THEN RAISE EXCEPTION 'Unsupported edit fields'; END IF;
 SELECT * INTO c FROM public.cash_transactions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
 SELECT * INTO n FROM jsonb_populate_record(c,p_patch);
 IF nullif(btrim(coalesce(n.description,'')),'') IS NULL OR n.transaction_date IS NULL THEN RAISE EXCEPTION 'Description and transaction date required'; END IF;
 IF n.branch_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.branches WHERE id=n.branch_id) THEN RAISE EXCEPTION 'Valid branch required'; END IF;
 IF n.vat_type IS NOT NULL AND n.vat_type NOT IN ('VAT','Non-VAT','') THEN RAISE EXCEPTION 'Invalid VAT type'; END IF;
 IF c.account='Funds' AND c.kind='Expense' THEN
  IF n.category<>'Part' THEN RAISE EXCEPTION 'RFP accepts Parts only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id=n.branch_id AND name IN ('Mastermind Mandaluyong','Underchargers Mandaluyong','Underchargers Las Piñas','Underchargers Quezon City')) THEN RAISE EXCEPTION 'Invalid RFP branch'; END IF;
  IF nullif(btrim(coalesce(n.payee,'')),'') IS NULL OR nullif(btrim(coalesce(n.vehicle_unit,'')),'') IS NULL OR nullif(btrim(coalesce(n.plate_number,'')),'') IS NULL THEN RAISE EXCEPTION 'Supplier, unit and plate are required'; END IF;
  IF n.quantity IS NULL OR n.unit_cost IS NULL OR n.quantity<=0 OR n.unit_cost<=0 THEN RAISE EXCEPTION 'Valid quantity and unit cost required'; END IF;
  IF p_patch ? 'amount' AND (p_patch->>'amount')::numeric IS DISTINCT FROM round(n.quantity*n.unit_cost,2) THEN
    RAISE EXCEPTION 'RFP amount must equal quantity × unit cost'; END IF;
  n.amount:=round(n.quantity*n.unit_cost,2);
  n.plate_number:=upper(regexp_replace(n.plate_number,'[^A-Za-z0-9]','','g'));
  IF EXISTS(SELECT 1 FROM public.rfp_part_pos_links WHERE cash_transaction_id=c.id)
   AND (n.branch_id IS DISTINCT FROM c.branch_id OR n.plate_number IS DISTINCT FROM upper(regexp_replace(coalesce(c.plate_number,''),'[^A-Za-z0-9]','','g'))) THEN
   RAISE EXCEPTION 'Linked POS branch/plate cannot be changed without reconciliation'; END IF;
  IF n.amount IS DISTINCT FROM c.amount AND EXISTS(SELECT 1 FROM public.rfp_disbursement_request_items WHERE expense_id=c.id) THEN
   RAISE EXCEPTION 'Expense is in a disbursement request; reconcile the posted request before changing amount'; END IF;
 ELSIF c.account='Funds' AND c.kind='Additional Funds' THEN
  IF n.amount IS DISTINCT FROM c.amount THEN RAISE EXCEPTION 'Released RFP replenishment amount is locked to its approved disbursement; edit its details only'; END IF;
 ELSE
  IF c.kind='Expense' AND nullif(btrim(coalesce(n.payee,'')),'') IS NULL THEN RAISE EXCEPTION 'Supplier/payee is required'; END IF;
  n.quantity:=1;n.unit_cost:=n.amount;
 END IF;
 IF n.amount IS NULL OR n.amount<=0 OR n.amount>100000000 OR length(btrim(coalesce(n.category,'')))=0 THEN RAISE EXCEPTION 'Invalid amount or category'; END IF;
 IF to_jsonb(c) IS NOT DISTINCT FROM to_jsonb(n) THEN RAISE EXCEPTION 'No changes to save'; END IF;
 -- Existing RFP release guard runs on UPDATE as well as INSERT; allow audited metadata updates
 -- without creating a new replenishment (only for an active Admin inside this RPC).
 IF c.account='Funds' AND c.kind='Additional Funds' THEN PERFORM set_config('app.rfp_release','1',true); END IF;
 UPDATE public.cash_transactions SET
  amount=n.amount,category=n.category,description=btrim(n.description),transaction_date=n.transaction_date,
  payee=n.payee,vat_type=n.vat_type,cash_voucher_no=n.cash_voucher_no,receipt_no=n.receipt_no,tin_no=n.tin_no,
  notes=n.notes,vehicle_unit=n.vehicle_unit,plate_number=n.plate_number,quantity=n.quantity,unit_cost=n.unit_cost,branch_id=n.branch_id
 WHERE id=p_id;
 SELECT * INTO n FROM public.cash_transactions WHERE id=p_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'cash',p_id,'Admin direct transaction edit',jsonb_build_object('reason',btrim(p_reason),
  'before',to_jsonb(c)-'signature_path'-'proof_path','after',to_jsonb(n)-'signature_path'-'proof_path'));
END $$;
REVOKE ALL ON FUNCTION public.admin_edit_cash(text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_edit_cash(text,jsonb,text) TO authenticated;

-- Existing cash-payment opening gate applies to new payments. During an audited Admin
-- correction, let historical POS payments be corrected without requiring today's cashier BOD.
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
 -- Audited correction of an existing sale; do not treat it as today's new payment.
 IF TG_OP='UPDATE' AND coalesce(current_setting('app.admin_transaction_edit',true),'')='1'
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND role IN ('Admin','Super Admin')) THEN
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

CREATE OR REPLACE FUNCTION public.admin_edit_pos(p_id text,p_patch jsonb,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.pos_accounts%ROWTYPE;n public.pos_accounts%ROWTYPE;v_role text;v_item jsonb;v_payment jsonb;v_cogs jsonb;
 v_total numeric:=0;v_paid numeric:=0;v_costs numeric:=0;
 v_allowed text[]:=ARRAY['client','phone','vehicle','plate','concern','items','payments','costs','cogs_items','bs_si','customer_tin','customer_address','mileage','platform','service_advisor','booked_by','mechanic','remarks','online_expense','rf_expense'];
BEGIN
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role NOT IN ('Admin','Super Admin') OR v_role IS NULL THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Edit reason must contain at least 5 characters'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb OR
  EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE NOT k=ANY(v_allowed)) THEN RAISE EXCEPTION 'Unsupported POS edit fields'; END IF;
 SELECT * INTO c FROM public.pos_accounts WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'POS not found'; END IF;
 SELECT * INTO n FROM jsonb_populate_record(c,p_patch);
 IF nullif(btrim(coalesce(n.client,'')),'') IS NULL OR nullif(btrim(coalesce(n.vehicle,'')),'') IS NULL THEN RAISE EXCEPTION 'Client and vehicle required'; END IF;
 IF jsonb_typeof(n.items)<>'array' OR jsonb_array_length(n.items)<1 OR jsonb_typeof(n.payments)<>'array' THEN RAISE EXCEPTION 'Valid items and payments arrays required'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(n.items) LOOP
  IF jsonb_typeof(v_item)<>'object' OR coalesce(v_item->>'type','') NOT IN ('Service','Part') OR nullif(btrim(v_item->>'name'),'') IS NULL OR
   jsonb_typeof(v_item->'qty')<>'number' OR jsonb_typeof(v_item->'price')<>'number' OR (v_item->>'qty')::numeric<=0 OR (v_item->>'price')::numeric<0 THEN RAISE EXCEPTION 'Invalid quotation item'; END IF;
  v_total:=v_total+(v_item->>'qty')::numeric*(v_item->>'price')::numeric;
 END LOOP;
 IF v_total<=0 OR v_total>100000000 THEN RAISE EXCEPTION 'Invalid sale total'; END IF;
 FOR v_payment IN SELECT value FROM jsonb_array_elements(n.payments) LOOP
  IF jsonb_typeof(v_payment)<>'object' OR jsonb_typeof(v_payment->'amount')<>'number' OR (v_payment->>'amount')::numeric<=0 OR nullif(btrim(v_payment->>'method'),'') IS NULL THEN RAISE EXCEPTION 'Invalid payment'; END IF;
  IF v_payment->>'method'<>'Cash' AND nullif(btrim(coalesce(v_payment->>'reference','')),'') IS NULL THEN RAISE EXCEPTION 'Noncash payment reference required'; END IF;
  v_paid:=v_paid+(v_payment->>'amount')::numeric;
 END LOOP;
 IF c.status='Closed' AND abs(v_total-v_paid)>0.01 THEN RAISE EXCEPTION 'Closed POS must remain fully paid'; END IF;
 IF c.status='Pending' AND v_paid>v_total+0.005 THEN RAISE EXCEPTION 'Overpayment is not allowed'; END IF;
 IF n.costs IS NULL OR n.costs<0 OR n.costs>100000000 OR n.online_expense IS NULL OR n.rf_expense IS NULL OR n.online_expense<0 OR n.rf_expense<0 THEN RAISE EXCEPTION 'Invalid cost/expense'; END IF;
 IF jsonb_typeof(n.cogs_items)<>'array' THEN RAISE EXCEPTION 'COGS items must be an array'; END IF;
 FOR v_cogs IN SELECT value FROM jsonb_array_elements(n.cogs_items) LOOP
  IF jsonb_typeof(v_cogs)<>'object' OR nullif(btrim(v_cogs->>'name'),'') IS NULL OR nullif(btrim(v_cogs->>'supplier'),'') IS NULL OR
   jsonb_typeof(v_cogs->'qty')<>'number' OR jsonb_typeof(v_cogs->'unitCost')<>'number' OR (v_cogs->>'qty')::numeric<=0 OR (v_cogs->>'unitCost')::numeric<0 THEN RAISE EXCEPTION 'Invalid COGS item'; END IF;
  v_costs:=v_costs+(v_cogs->>'qty')::numeric*(v_cogs->>'unitCost')::numeric;
 END LOOP;
 IF p_patch ? 'cogs_items' AND p_patch ? 'costs' AND abs(v_costs-n.costs)>0.01 THEN RAISE EXCEPTION 'Total COGS must equal the itemized COGS total'; END IF;
 IF p_patch ? 'cogs_items' THEN n.costs:=round(v_costs,2); END IF;
 n.plate:=upper(regexp_replace(coalesce(n.plate,''),'[^A-Za-z0-9]','','g'));
 IF n.plate IS DISTINCT FROM c.plate AND EXISTS(SELECT 1 FROM public.rfp_part_pos_links l JOIN public.cash_transactions t ON t.id=l.cash_transaction_id
 WHERE l.pos_id=p_id AND upper(regexp_replace(coalesce(t.plate_number,''),'[^A-Za-z0-9]','','g')) IS DISTINCT FROM n.plate) THEN
  RAISE EXCEPTION 'Cannot change plate: POS has linked RFP Parts with different plate'; END IF;
 IF to_jsonb(c) IS NOT DISTINCT FROM to_jsonb(n) THEN RAISE EXCEPTION 'No changes to save'; END IF;
 PERFORM set_config('app.admin_transaction_edit','1',true);
 UPDATE public.pos_accounts SET
  client=n.client,phone=n.phone,vehicle=n.vehicle,plate=n.plate,concern=n.concern,items=n.items,payments=n.payments,
  costs=n.costs,cogs_items=n.cogs_items,bs_si=n.bs_si,customer_tin=n.customer_tin,customer_address=n.customer_address,
  mileage=n.mileage,platform=n.platform,service_advisor=n.service_advisor,booked_by=n.booked_by,mechanic=n.mechanic,
  remarks=n.remarks,online_expense=n.online_expense,rf_expense=n.rf_expense WHERE id=p_id;
 SELECT * INTO n FROM public.pos_accounts WHERE id=p_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'pos',p_id,'Admin direct transaction edit',jsonb_build_object('reason',btrim(p_reason),'before',to_jsonb(c),'after',to_jsonb(n)));
END $$;
REVOKE ALL ON FUNCTION public.admin_edit_pos(text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_edit_pos(text,jsonb,text) TO authenticated;

-- Ask PostgREST to refresh its cache so the new table/RPCs are available after migration.
NOTIFY pgrst, 'reload schema';
COMMIT;
