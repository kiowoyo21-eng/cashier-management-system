-- v14: PB-only RFP Request Edit. Run AFTER migration_024.
BEGIN;
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
REVOKE ALL ON public.rfp_edit_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.rfp_edit_requests TO authenticated;
DROP POLICY IF EXISTS rfp_edit_read ON public.rfp_edit_requests;
CREATE POLICY rfp_edit_read ON public.rfp_edit_requests FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.id=auth.uid() AND pr.is_active AND (
 pr.role IN ('Admin','Super Admin') OR
 (pr.role='PB' AND (rfp_edit_requests.requested_by=auth.uid() OR pr.branch_id=rfp_edit_requests.original_branch_id)) OR
 (pr.role='Branch Manager' AND pr.branch_id IN (rfp_edit_requests.original_branch_id,rfp_edit_requests.proposed_branch_id))
 ))
);
CREATE OR REPLACE FUNCTION public.request_rfp_edit(p_cash_id text,p_reason text,p_proposed jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cash_transactions%ROWTYPE;v_role text;v_branch uuid;v_dest uuid;v_qty numeric;v_cost numeric;v_id uuid;v_allowed text[]:=ARRAY['description','payee','plate_number','vehicle_unit','quantity','unit_cost','branch_id'];
BEGIN
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active;
 IF v_role IS DISTINCT FROM 'PB' THEN RAISE EXCEPTION 'Only PB may request RFP corrections'; END IF;
 SELECT * INTO c FROM public.cash_transactions WHERE id=p_cash_id FOR UPDATE;
 IF NOT FOUND OR c.account<>'Funds' OR c.kind<>'Expense' THEN RAISE EXCEPTION 'RFP parts expense required'; END IF;
 IF v_branch IS NOT NULL AND c.branch_id IS DISTINCT FROM v_branch THEN RAISE EXCEPTION 'Cannot edit another branch'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'Reason must be at least 10 characters'; END IF;
 IF p_proposed IS NULL OR jsonb_typeof(p_proposed)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_proposed) x WHERE NOT x=ANY(v_allowed)) THEN RAISE EXCEPTION 'Unsupported correction fields'; END IF;
 IF NULLIF(p_proposed->>'branch_id','') IS NULL THEN RAISE EXCEPTION 'Select a branch'; END IF;
 v_dest:=(p_proposed->>'branch_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.branches WHERE id=v_dest AND name IN ('UC Mandaluyong','UC Quezon City','UC Las Pinas','MM Mandaluyong')) THEN RAISE EXCEPTION 'Invalid destination branch'; END IF;
 IF length(btrim(coalesce(p_proposed->>'description','')))=0 OR length(btrim(coalesce(p_proposed->>'plate_number','')))=0 OR length(btrim(coalesce(p_proposed->>'payee','')))=0 THEN RAISE EXCEPTION 'Part, plate and supplier are required'; END IF;
 v_qty:=(p_proposed->>'quantity')::numeric;v_cost:=(p_proposed->>'unit_cost')::numeric;
 IF v_qty<=0 OR v_cost<=0 OR v_qty IS NULL OR v_cost IS NULL THEN RAISE EXCEPTION 'Valid quantity and unit cost required'; END IF;
 IF EXISTS(SELECT 1 FROM public.rfp_part_pos_links WHERE cash_transaction_id=p_cash_id) AND
 (v_dest IS DISTINCT FROM c.branch_id OR upper(regexp_replace(p_proposed->>'plate_number','[^A-Za-z0-9]','','g')) IS DISTINCT FROM upper(regexp_replace(coalesce(c.plate_number,''),'[^A-Za-z0-9]','','g'))) THEN
 RAISE EXCEPTION 'This part is linked to a POS. Resolve link first; branch/plate cannot be changed directly'; END IF;
 INSERT INTO public.rfp_edit_requests(cash_id,requested_by,original_branch_id,proposed_branch_id,old_values,proposed,reason)
 VALUES(p_cash_id,auth.uid(),c.branch_id,v_dest,
 jsonb_build_object('amount',c.amount,'description',c.description,'payee',c.payee,'plate_number',c.plate_number,'vehicle_unit',c.vehicle_unit,'quantity',c.quantity,'unit_cost',c.unit_cost,'branch_id',c.branch_id),p_proposed,btrim(p_reason)) RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'rfp_edit_request',v_id::text,'PB requested RFP edit',jsonb_build_object('cash_id',p_cash_id,'reason',p_reason,'proposed',p_proposed));
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.review_rfp_edit(p_request_id uuid,p_action text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.rfp_edit_requests%ROWTYPE;c public.cash_transactions%ROWTYPE;v_role text;v_branch uuid;v_qty numeric;v_cost numeric;
BEGIN
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active;
 IF v_role NOT IN ('Branch Manager','Admin','Super Admin') OR v_role IS NULL THEN RAISE EXCEPTION 'Authorized reviewer required'; END IF;
 IF p_action NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 SELECT * INTO r FROM public.rfp_edit_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'Pending' THEN RAISE EXCEPTION 'Pending request required'; END IF;
 IF v_role='Branch Manager' AND v_branch IS DISTINCT FROM r.original_branch_id THEN RAISE EXCEPTION 'Original branch manager approval required'; END IF;
 SELECT * INTO c FROM public.cash_transactions WHERE id=r.cash_id FOR UPDATE;
 IF c.id IS NULL OR c.account<>'Funds' OR c.kind<>'Expense' THEN RAISE EXCEPTION 'Source expense missing'; END IF;
 IF p_action='approve' THEN
  IF c.branch_id IS DISTINCT FROM r.original_branch_id OR c.amount IS DISTINCT FROM (r.old_values->>'amount')::numeric OR c.plate_number IS DISTINCT FROM r.old_values->>'plate_number' THEN RAISE EXCEPTION 'Expense changed; request must be resubmitted'; END IF;
  IF r.proposed_branch_id IS DISTINCT FROM r.original_branch_id AND v_role='Branch Manager' THEN RAISE EXCEPTION 'Cross-branch transfers require Admin or Super Admin review'; END IF;
  IF EXISTS(SELECT 1 FROM public.rfp_part_pos_links WHERE cash_transaction_id=c.id) AND
    (r.proposed_branch_id IS DISTINCT FROM c.branch_id OR upper(regexp_replace(r.proposed->>'plate_number','[^A-Za-z0-9]','','g')) IS DISTINCT FROM upper(regexp_replace(coalesce(c.plate_number,''),'[^A-Za-z0-9]','','g'))) THEN RAISE EXCEPTION 'Linked POS cannot be reassigned'; END IF;
  v_qty:=(r.proposed->>'quantity')::numeric;v_cost:=(r.proposed->>'unit_cost')::numeric;
  IF v_qty<=0 OR v_cost<=0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  -- Existing cash_role_guard still runs; historical invalid-ID entries require a separate migration.
  UPDATE public.cash_transactions SET description=r.proposed->>'description',payee=r.proposed->>'payee',plate_number=r.proposed->>'plate_number',vehicle_unit=r.proposed->>'vehicle_unit',quantity=v_qty,unit_cost=v_cost,amount=round(v_qty*v_cost,2),branch_id=r.proposed_branch_id WHERE id=c.id;
 END IF;
 UPDATE public.rfp_edit_requests SET status=CASE WHEN p_action='approve' THEN 'Approved' ELSE 'Rejected' END,reviewer_id=auth.uid(),reviewer_note=p_note,reviewed_at=now() WHERE id=r.id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'rfp_edit_request',r.id::text,'RFP correction '||p_action,jsonb_build_object('cash_id',r.cash_id,'old',r.old_values,'proposed',r.proposed,'note',p_note));
END $$;
REVOKE ALL ON FUNCTION public.request_rfp_edit(text,text,jsonb),public.review_rfp_edit(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_rfp_edit(text,text,jsonb),public.review_rfp_edit(uuid,text,text) TO authenticated;
COMMIT;
