-- Run AFTER migration_022. No existing POS is changed during installation.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sales_branch_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 pos_id text NOT NULL REFERENCES public.pos_accounts(id),
 source_branch_id uuid NOT NULL REFERENCES public.branches(id),
 target_branch_id uuid NOT NULL REFERENCES public.branches(id),
 requested_by uuid NOT NULL REFERENCES public.profiles(id),
 reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 2000),
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected')),
 source_approved_by uuid REFERENCES public.profiles(id),
 target_approved_by uuid REFERENCES public.profiles(id),
 reviewed_at timestamptz,
 reviewer_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(source_branch_id<>target_branch_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_branch_change_one_pending ON public.sales_branch_change_requests(pos_id) WHERE status='Pending';
ALTER TABLE public.sales_branch_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_branch_change_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sales_branch_change_requests TO authenticated;
DROP POLICY IF EXISTS sales_branch_change_read ON public.sales_branch_change_requests;
CREATE POLICY sales_branch_change_read ON public.sales_branch_change_requests FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_active AND (
 (p.role='PB' AND requested_by=auth.uid()) OR
 (p.role='Branch Manager' AND p.branch_id IN (source_branch_id,target_branch_id)) OR
 p.role IN ('Admin','Super Admin')))
);
-- Exemption applies ONLY to branch_id change during an explicitly validated approval RPC.
-- The RPC is SECURITY DEFINER, enforces PB/manager roles, and audits both approvals.
CREATE OR REPLACE FUNCTION private.pos_role_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;v_branch uuid;v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_clock time:=(now() AT TIME ZONE 'Asia/Manila')::time;
BEGIN
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF TG_OP='UPDATE' AND coalesce(current_setting('app.approved_sales_branch_transfer',true),'')='1'
  AND NEW.branch_id IS DISTINCT FROM OLD.branch_id
  AND (to_jsonb(NEW)-'branch_id') = (to_jsonb(OLD)-'branch_id') THEN
  RETURN NEW;
 END IF;
 IF v_role NOT IN ('Cashier','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'POS / Sales activity is restricted to Cashier or authorized management'; END IF;
 IF TG_OP='INSERT' AND NEW.id NOT LIKE 'POS-%' THEN RAISE EXCEPTION 'Invalid POS transaction number'; END IF;
 IF v_role IN ('Cashier','Branch Manager') AND NEW.branch_id IS DISTINCT FROM v_branch THEN RAISE EXCEPTION 'POS branch does not match your assigned branch'; END IF;
 IF v_role='Cashier' THEN
  IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=v_branch AND cash_account='Sales' AND count_type='BOD' AND business_date=v_day) THEN RAISE EXCEPTION 'Sales Opening Cash Count is required before POS activity'; END IF;
  IF EXISTS(SELECT 1 FROM public.daily_sales_handovers WHERE branch_id=v_branch AND business_date=v_day AND cashier_id=auth.uid()) THEN RAISE EXCEPTION 'Sales Turnover is already complete; Sales activity is locked for today'; END IF;
  IF v_clock>=time '17:00' THEN RAISE EXCEPTION 'Sales Turnover is required; POS activity is locked for end-of-day closing'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.request_sales_branch_change(p_pos_id text,p_target_branch uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;v_pos public.pos_accounts%ROWTYPE;v_id uuid;
BEGIN
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role IS DISTINCT FROM 'PB' THEN RAISE EXCEPTION 'Only PB may request a branch change'; END IF;
 IF length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Reason must contain 10 to 2000 characters'; END IF;
 SELECT * INTO v_pos FROM public.pos_accounts WHERE id=p_pos_id AND status='Closed' FOR UPDATE;
 IF NOT FOUND OR v_pos.branch_id IS NULL THEN RAISE EXCEPTION 'Assigned Closed POS required'; END IF;
 IF v_pos.branch_id=p_target_branch OR NOT EXISTS(SELECT 1 FROM public.branches WHERE id=p_target_branch AND name IN ('UC Mandaluyong','UC Quezon City','UC Las Pinas','MM Mandaluyong')) THEN RAISE EXCEPTION 'Select a different valid physical branch'; END IF;
 IF EXISTS(SELECT 1 FROM public.sales_branch_change_requests WHERE pos_id=p_pos_id AND status='Pending') OR EXISTS(SELECT 1 FROM public.sales_edit_requests WHERE pos_id=p_pos_id AND status IN ('Pending','Explanation Requested')) THEN RAISE EXCEPTION 'Another correction is pending for this sale'; END IF;
 INSERT INTO public.sales_branch_change_requests(pos_id,source_branch_id,target_branch_id,requested_by,reason)
 VALUES(p_pos_id,v_pos.branch_id,p_target_branch,auth.uid(),trim(p_reason)) RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'sales_branch_change',v_id::text,'PB requested branch transfer',jsonb_build_object('pos_id',p_pos_id,'from',v_pos.branch_id,'to',p_target_branch,'reason',p_reason));
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.review_sales_branch_change(p_request_id uuid,p_action text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;v_branch uuid;v_req public.sales_branch_change_requests%ROWTYPE;v_pos public.pos_accounts%ROWTYPE;v_source uuid;v_target uuid;
BEGIN
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role IS DISTINCT FROM 'Branch Manager' THEN RAISE EXCEPTION 'Only Branch Managers can review branch transfer'; END IF;
 IF p_action NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 IF p_action='reject' AND length(trim(coalesce(p_note,'')))<5 THEN RAISE EXCEPTION 'Rejection reason required'; END IF;
 SELECT * INTO v_req FROM public.sales_branch_change_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR v_req.status<>'Pending' THEN RAISE EXCEPTION 'No pending transfer'; END IF;
 IF v_branch NOT IN (v_req.source_branch_id,v_req.target_branch_id) THEN RAISE EXCEPTION 'Request is not for your branch'; END IF;
 SELECT * INTO v_pos FROM public.pos_accounts WHERE id=v_req.pos_id FOR UPDATE;
 IF NOT FOUND OR v_pos.status<>'Closed' OR v_pos.branch_id IS DISTINCT FROM v_req.source_branch_id THEN RAISE EXCEPTION 'Original sale moved or changed status; reconcile manually'; END IF;
 IF p_action='reject' THEN
  UPDATE public.sales_branch_change_requests SET status='Rejected',reviewer_note=trim(p_note),reviewed_at=now() WHERE id=p_request_id;
 ELSE
  IF v_branch=v_req.source_branch_id AND v_req.source_approved_by IS NOT NULL THEN RAISE EXCEPTION 'Source branch already approved'; END IF;
  IF v_branch=v_req.target_branch_id AND v_req.target_approved_by IS NOT NULL THEN RAISE EXCEPTION 'Destination branch already approved'; END IF;
  v_source:=coalesce(v_req.source_approved_by,CASE WHEN v_branch=v_req.source_branch_id THEN auth.uid() END);
  v_target:=coalesce(v_req.target_approved_by,CASE WHEN v_branch=v_req.target_branch_id THEN auth.uid() END);
  UPDATE public.sales_branch_change_requests SET source_approved_by=v_source,target_approved_by=v_target,
   status=CASE WHEN v_source IS NOT NULL AND v_target IS NOT NULL THEN 'Approved' ELSE 'Pending' END,
   reviewer_note=nullif(trim(p_note),''),reviewed_at=now() WHERE id=p_request_id;
  IF v_source IS NOT NULL AND v_target IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.sales_edit_requests WHERE pos_id=v_req.pos_id AND status IN ('Pending','Explanation Requested')) THEN RAISE EXCEPTION 'Other sales correction pending'; END IF;
   PERFORM set_config('app.approved_sales_branch_transfer','1',true);
   UPDATE public.pos_accounts SET branch_id=v_req.target_branch_id WHERE id=v_req.pos_id;
   PERFORM set_config('app.approved_sales_branch_transfer','0',true);
  END IF;
 END IF;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'sales_branch_change',p_request_id::text,'Branch Manager '||p_action,jsonb_build_object('pos_id',v_req.pos_id,'from',v_req.source_branch_id,'to',v_req.target_branch_id,'note',p_note,'source_approved',v_source IS NOT NULL,'target_approved',v_target IS NOT NULL));
END $$;
REVOKE ALL ON FUNCTION public.request_sales_branch_change(text,uuid,text),public.review_sales_branch_change(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_sales_branch_change(text,uuid,text),public.review_sales_branch_change(uuid,text,text) TO authenticated;
COMMIT;
