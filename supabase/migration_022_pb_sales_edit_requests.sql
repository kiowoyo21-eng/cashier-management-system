-- Apply after migrations 001-021. PB requests, Branch Manager decides; no direct sales edits.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sales_edit_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 pos_id text NOT NULL REFERENCES public.pos_accounts(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 requested_by uuid NOT NULL REFERENCES public.profiles(id),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
 original jsonb NOT NULL,
 proposed jsonb NOT NULL,
 status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected','Explanation Requested')),
 reviewer_id uuid REFERENCES public.profiles(id),
 reviewer_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_edit_single_open_per_pos ON public.sales_edit_requests(pos_id) WHERE status IN ('Pending','Explanation Requested');
CREATE INDEX IF NOT EXISTS sales_edit_branch_status ON public.sales_edit_requests(branch_id,status,created_at DESC);
ALTER TABLE public.sales_edit_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_edit_requests FROM anon,authenticated;
GRANT SELECT ON public.sales_edit_requests TO authenticated;
DROP POLICY IF EXISTS sales_edit_read ON public.sales_edit_requests;
CREATE POLICY sales_edit_read ON public.sales_edit_requests FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.id=auth.uid() AND pr.is_active AND (
  (pr.role='PB' AND requested_by=auth.uid()) OR
  (pr.role='Branch Manager' AND pr.branch_id=sales_edit_requests.branch_id) OR
  pr.role IN ('Admin','Super Admin')
 ))
);
-- PB may see closed sales needed to propose an edit, but cannot update the original POS.
DROP POLICY IF EXISTS pos_read ON public.pos_accounts;
CREATE POLICY pos_read ON public.pos_accounts FOR SELECT TO authenticated USING (
 private.is_admin() OR
 (private.my_role()='Branch Manager' AND branch_id=private.my_branch()) OR
 (private.my_role()='Cashier' AND branch_id=private.my_branch()) OR
 (private.my_role()='PB' AND status='Closed')
);

CREATE OR REPLACE FUNCTION public.request_sales_edit(p_pos_id text,p_reason text,p_proposed jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text; v_row public.pos_accounts%ROWTYPE; v_id uuid; v_original jsonb; v_allowed text[]:=ARRAY['client','plate','bs_si','remarks','costs','items','payments'];
BEGIN
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role IS DISTINCT FROM 'PB' THEN RAISE EXCEPTION 'Only PB can request Sales edits'; END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Reason must be between 10 and 2000 characters'; END IF;
 IF jsonb_typeof(p_proposed) IS DISTINCT FROM 'object' OR p_proposed='{}'::jsonb THEN RAISE EXCEPTION 'At least one proposed field is required'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_proposed) x WHERE x <> ALL(v_allowed)) THEN RAISE EXCEPTION 'Unsupported sales edit field'; END IF;
 SELECT * INTO v_row FROM public.pos_accounts WHERE id=p_pos_id AND status='Closed';
 IF NOT FOUND OR v_row.branch_id IS NULL THEN RAISE EXCEPTION 'Closed POS with assigned branch required'; END IF;
 IF EXISTS(SELECT 1 FROM public.sales_edit_requests WHERE pos_id=p_pos_id AND status IN ('Pending','Explanation Requested')) THEN RAISE EXCEPTION 'A review is already open for this sale'; END IF;
 IF p_proposed ? 'costs' AND (jsonb_typeof(p_proposed->'costs')<>'number' OR (p_proposed->>'costs')::numeric < 0) THEN RAISE EXCEPTION 'Invalid COGS'; END IF;
 IF p_proposed ? 'items' AND (jsonb_typeof(p_proposed->'items')<>'array' OR jsonb_array_length(p_proposed->'items')<1) THEN RAISE EXCEPTION 'Quotation items must be a non-empty array'; END IF;
 IF p_proposed ? 'payments' AND jsonb_typeof(p_proposed->'payments')<>'array' THEN RAISE EXCEPTION 'Payments must be an array'; END IF;
 v_original=jsonb_build_object('client',v_row.client,'plate',v_row.plate,'bs_si',v_row.bs_si,'remarks',v_row.remarks,'costs',v_row.costs,'items',v_row.items,'payments',v_row.payments,'status',v_row.status);
 INSERT INTO public.sales_edit_requests(pos_id,branch_id,requested_by,reason,original,proposed)
 VALUES(p_pos_id,v_row.branch_id,auth.uid(),btrim(p_reason),v_original,p_proposed) RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'sales_edit_request',v_id::text,'PB requested Sales edit',jsonb_build_object('pos_id',p_pos_id,'reason',p_reason,'changes',p_proposed));
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.review_sales_edit(p_request_id uuid,p_action text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;v_branch uuid;v_req public.sales_edit_requests%ROWTYPE;v_pos public.pos_accounts%ROWTYPE;v_new jsonb;v_items jsonb;v_payments jsonb;v_gross numeric;v_paid numeric;
BEGIN
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role IS DISTINCT FROM 'Branch Manager' THEN RAISE EXCEPTION 'Only the assigned Branch Manager may review Sales edits'; END IF;
 IF p_action NOT IN ('approve','reject','explain') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF p_action IN ('reject','explain') AND length(btrim(coalesce(p_note,'')))<5 THEN RAISE EXCEPTION 'Review note is required'; END IF;
 SELECT * INTO v_req FROM public.sales_edit_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_req.status <> 'Pending' THEN RAISE EXCEPTION 'Only pending requests can be reviewed'; END IF;
 IF v_req.branch_id IS DISTINCT FROM v_branch THEN RAISE EXCEPTION 'Request belongs to another branch'; END IF;
 SELECT * INTO v_pos FROM public.pos_accounts WHERE id=v_req.pos_id FOR UPDATE;
 IF NOT FOUND OR v_pos.status<>'Closed' OR v_pos.branch_id IS DISTINCT FROM v_req.branch_id THEN RAISE EXCEPTION 'Sales record changed; manual reconciliation required'; END IF;
 IF p_action='approve' THEN
   IF jsonb_build_object('client',v_pos.client,'plate',v_pos.plate,'bs_si',v_pos.bs_si,'remarks',v_pos.remarks,'costs',v_pos.costs,'items',v_pos.items,'payments',v_pos.payments,'status',v_pos.status) IS DISTINCT FROM v_req.original THEN RAISE EXCEPTION 'Sale has changed since request; new request required'; END IF;
   v_new=v_req.original||v_req.proposed;
   v_items=v_new->'items'; v_payments=v_new->'payments';
   IF jsonb_typeof(v_items)<>'array' OR jsonb_array_length(v_items)<1 OR jsonb_typeof(v_payments)<>'array' THEN RAISE EXCEPTION 'Invalid sales items/payments'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_items) i WHERE jsonb_typeof(i)<>'object' OR jsonb_typeof(i->'qty')<>'number' OR jsonb_typeof(i->'price')<>'number' OR (i->>'qty')::numeric<=0 OR (i->>'price')::numeric<0) THEN RAISE EXCEPTION 'Invalid quotation item'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_payments) p WHERE jsonb_typeof(p)<>'object' OR jsonb_typeof(p->'amount')<>'number' OR (p->>'amount')::numeric<=0 OR nullif(trim(p->>'method'),'') IS NULL) THEN RAISE EXCEPTION 'Invalid payment'; END IF;
   SELECT coalesce(sum((i->>'qty')::numeric*(i->>'price')::numeric),0) INTO v_gross FROM jsonb_array_elements(v_items) i;
   SELECT coalesce(sum((p->>'amount')::numeric),0) INTO v_paid FROM jsonb_array_elements(v_payments) p;
   IF abs(v_gross-v_paid)>0.01 THEN RAISE EXCEPTION 'Closed POS must remain fully paid: quotation and payments must match'; END IF;
   IF (v_new->>'costs')::numeric < 0 OR (v_new->>'costs')::numeric > 999999999999 THEN RAISE EXCEPTION 'Invalid COGS amount'; END IF;
   IF length(trim(coalesce(v_new->>'client','')))<1 OR length(trim(coalesce(v_new->>'plate','')))<1 THEN RAISE EXCEPTION 'Client and plate are required'; END IF;
   -- Approved correction remains attached to original Closed POS; no new sales row.
   UPDATE public.pos_accounts SET client=v_new->>'client',plate=v_new->>'plate',bs_si=v_new->>'bs_si',remarks=v_new->>'remarks',costs=(v_new->>'costs')::numeric,items=v_items,payments=v_payments WHERE id=v_req.pos_id;
 END IF;
 UPDATE public.sales_edit_requests SET status=CASE p_action WHEN 'approve' THEN 'Approved' WHEN 'reject' THEN 'Rejected' ELSE 'Explanation Requested' END,
 reviewer_id=auth.uid(),reviewer_note=nullif(btrim(p_note),''),reviewed_at=now() WHERE id=p_request_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'sales_edit_request',p_request_id::text,'BM '||p_action||' Sales edit',jsonb_build_object('pos_id',v_req.pos_id,'original',v_req.original,'proposed',v_req.proposed,'note',p_note));
END $$;
CREATE OR REPLACE FUNCTION public.explain_sales_edit(p_request_id uuid,p_explanation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_req public.sales_edit_requests%ROWTYPE; v_role text;
BEGIN
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role IS DISTINCT FROM 'PB' THEN RAISE EXCEPTION 'Only PB may explain a Sales edit request'; END IF;
 IF length(trim(coalesce(p_explanation,'')))<10 THEN RAISE EXCEPTION 'Explanation must contain at least 10 characters'; END IF;
 SELECT * INTO v_req FROM public.sales_edit_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_req.requested_by IS DISTINCT FROM auth.uid() OR v_req.status <> 'Explanation Requested' THEN RAISE EXCEPTION 'Explanation not allowed'; END IF;
 UPDATE public.sales_edit_requests SET status='Pending',reason=reason||E'\nPB explanation: '||btrim(p_explanation),reviewer_id=NULL,reviewer_note=NULL,reviewed_at=NULL WHERE id=p_request_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'sales_edit_request',p_request_id::text,'PB supplied explanation',jsonb_build_object('explanation',p_explanation));
END $$;
REVOKE ALL ON FUNCTION public.request_sales_edit(text,text,jsonb),public.review_sales_edit(uuid,text,text),public.explain_sales_edit(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_sales_edit(text,text,jsonb),public.review_sales_edit(uuid,text,text),public.explain_sales_edit(uuid,text) TO authenticated;
COMMIT;
