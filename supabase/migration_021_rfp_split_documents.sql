-- CMS v21: separate one-page RFP Disbursement Report PDF and Receipts PDF.
-- Run AFTER migration_020_physical_rfp_branches.sql.
BEGIN;

ALTER TABLE public.rfp_disbursement_requests
ADD COLUMN IF NOT EXISTS receipts_pdf_path text;

-- Older single-PDF submissions are retired so every new request carries both files.
REVOKE EXECUTE ON FUNCTION public.submit_rfp_disbursement_request_v2(text,text[],text,text,numeric,text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.submit_rfp_disbursement_request_v3(
 p_id text,
 p_expense_ids text[],
 p_report_pdf_path text,
 p_receipts_pdf_path text,
 p_signature_path text,
 p_check_deposit numeric DEFAULT 0,
 p_notes text DEFAULT ''
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_branch uuid;
 v_role text;
 v_count integer;
 v_total numeric(14,2);
 v_start date;
 v_end date;
 v_remaining numeric(14,2);
 v_beginning numeric(14,2);
 v_requested numeric(14,2);
BEGIN
 PERFORM private.assert_active();
 SELECT branch_id,role INTO v_branch,v_role
 FROM public.profiles
 WHERE id=auth.uid() AND is_active=true;

 IF v_role NOT IN ('PB','Admin','Branch Manager','Super Admin') OR v_branch IS NULL THEN
  RAISE EXCEPTION 'PB or authorized management role required';
 END IF;

 IF p_id NOT LIKE 'RFP-DR-%'
    OR coalesce(array_length(p_expense_ids,1),0)=0
    OR coalesce(p_check_deposit,0)<0 THEN
  RAISE EXCEPTION 'Invalid disbursement request';
 END IF;

 IF p_report_pdf_path IS NULL
    OR split_part(p_report_pdf_path,'/',1)<>auth.uid()::text
    OR lower(storage.extension(p_report_pdf_path))<>'pdf'
    OR NOT EXISTS(
      SELECT 1 FROM storage.objects
      WHERE bucket_id='transaction-evidence' AND name=p_report_pdf_path
    ) THEN
  RAISE EXCEPTION 'Disbursement Report PDF is required';
 END IF;

 IF p_receipts_pdf_path IS NULL
    OR split_part(p_receipts_pdf_path,'/',1)<>auth.uid()::text
    OR lower(storage.extension(p_receipts_pdf_path))<>'pdf'
    OR NOT EXISTS(
      SELECT 1 FROM storage.objects
      WHERE bucket_id='transaction-evidence' AND name=p_receipts_pdf_path
    ) THEN
  RAISE EXCEPTION 'Receipts PDF is required';
 END IF;

 IF p_signature_path IS NULL
    OR split_part(p_signature_path,'/',1)<>auth.uid()::text
    OR NOT EXISTS(
      SELECT 1 FROM storage.objects
      WHERE bucket_id='transaction-evidence' AND name=p_signature_path
    ) THEN
  RAISE EXCEPTION 'PB signature is required';
 END IF;

 IF EXISTS(
  SELECT 1 FROM public.rfp_disbursement_request_items
  WHERE expense_id=ANY(p_expense_ids)
 ) THEN
  RAISE EXCEPTION 'One or more expenses are already included in another disbursement request';
 END IF;

 SELECT count(*),coalesce(sum(amount),0),min(transaction_date),max(transaction_date)
 INTO v_count,v_total,v_start,v_end
 FROM public.cash_transactions
 WHERE id=ANY(p_expense_ids)
   AND account='Funds'
   AND kind='Expense'
   AND proof_path IS NOT NULL
   AND category IN ('Part','Supply')
   AND quantity>0
   AND unit_cost>0;

 IF v_count<>array_length(p_expense_ids,1) OR v_total<=0 THEN
  RAISE EXCEPTION 'All covered RFP expenses must be Parts/Supplies with receipt proof and item details';
 END IF;

 IF p_check_deposit>v_total THEN
  RAISE EXCEPTION 'Check Deposit cannot exceed covered expenses';
 END IF;

 SELECT coalesce(sum(CASE WHEN kind='Additional Funds' THEN amount ELSE -amount END),0)
 INTO v_remaining
 FROM public.cash_transactions
 WHERE account='Funds';

 v_beginning:=v_remaining+v_total;
 v_requested:=v_beginning-(v_remaining+p_check_deposit);
 IF v_requested<=0 THEN
  RAISE EXCEPTION 'No disbursement amount remains after Check Deposit';
 END IF;

 INSERT INTO public.rfp_disbursement_requests(
  id,branch_id,requested_by,period_start,period_end,current_balance,
  beginning_balance,remaining_balance,check_deposit,total_expenses,
  amount_requested,expense_count,pdf_path,receipts_pdf_path,signature_path,
  notes,status
 ) VALUES(
  p_id,v_branch,auth.uid(),
  coalesce(v_start,(now() AT TIME ZONE 'Asia/Manila')::date),
  coalesce(v_end,(now() AT TIME ZONE 'Asia/Manila')::date),
  v_remaining,v_beginning,v_remaining,p_check_deposit,v_total,v_requested,
  v_count,p_report_pdf_path,p_receipts_pdf_path,p_signature_path,
  nullif(btrim(coalesce(p_notes,'')),''),'Pending Verification'
 );

 INSERT INTO public.rfp_disbursement_request_items(request_id,expense_id,amount)
 SELECT p_id,id,amount
 FROM public.cash_transactions
 WHERE id=ANY(p_expense_ids);

 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(
  auth.uid(),'rfp_disbursement',p_id,'RFP Disbursement submitted to Accounting',
  jsonb_build_object(
   'expense_count',v_count,
   'total_expenses',v_total,
   'check_deposit',p_check_deposit,
   'amount_requested',v_requested,
   'report_pdf',p_report_pdf_path,
   'receipts_pdf',p_receipts_pdf_path
  )
 );
 RETURN p_id;
END $$;

REVOKE ALL ON FUNCTION public.submit_rfp_disbursement_request_v3(text,text[],text,text,text,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_rfp_disbursement_request_v3(text,text[],text,text,text,numeric,text) TO authenticated;

-- Accounting and President must be able to open both request documents.
DROP POLICY IF EXISTS evidence_read ON storage.objects;
CREATE POLICY evidence_read ON storage.objects FOR SELECT TO authenticated USING(
 bucket_id='transaction-evidence' AND (
  (storage.foldername(name))[1]=auth.uid()::text
  OR private.is_admin()
  OR EXISTS(
    SELECT 1 FROM public.rfp_disbursement_requests r
    WHERE name IN (
      r.pdf_path,
      r.receipts_pdf_path,
      r.signature_path,
      r.verified_signature_path,
      r.approved_signature_path
    )
    AND private.my_role() IN ('Accounting','President')
  )
  OR EXISTS(
    SELECT 1
    FROM public.profiles viewer
    JOIN public.profiles owner
      ON owner.id::text=(storage.foldername(name))[1]
    WHERE viewer.id=auth.uid()
      AND viewer.is_active=true
      AND viewer.role='Branch Manager'
      AND viewer.branch_id=owner.branch_id
  )
 )
);

COMMIT;
