-- CMS v8: add-only migration. Never resets existing financial records.
BEGIN;
CREATE TABLE IF NOT EXISTS public.cash_incident_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 cash_account text NOT NULL CHECK (cash_account IN ('Funds','Petty Cash')),
 incident_type text NOT NULL CHECK (incident_type IN ('Missed EOD','Late BOD','BOD Discrepancy','Missed Turnover')),
 business_date date NOT NULL,
 reason text NOT NULL CHECK (char_length(btrim(reason))>3),
 signature_path text NOT NULL,
 status text NOT NULL DEFAULT 'Pending BM Review' CHECK (status IN ('Pending BM Review','Acknowledged','Submit Explanation','Escalated','Resolved')),
 linked_count_id uuid REFERENCES public.daily_cash_counts(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by uuid REFERENCES auth.users(id),
 review_note text,
 UNIQUE(branch_id,cash_account,incident_type,business_date)
);
CREATE INDEX IF NOT EXISTS cash_ir_branch_date_idx ON public.cash_incident_reports(branch_id,business_date DESC);
ALTER TABLE public.cash_incident_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cash_ir_read ON public.cash_incident_reports;
CREATE POLICY cash_ir_read ON public.cash_incident_reports FOR SELECT TO authenticated USING (
 actor_id=auth.uid() OR private.is_super() OR
 (private.is_bm() AND branch_id=private.my_branch()) OR
 EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='Admin')
);
GRANT SELECT ON public.cash_incident_reports TO authenticated;
CREATE OR REPLACE FUNCTION public.submit_cash_incident(p_account text,p_type text,p_date date,p_reason text,p_signature text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_branch uuid; v_id uuid; v_now date:=(now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
 PERFORM private.assert_active();
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='Cashier') THEN RAISE EXCEPTION 'Cashier role required'; END IF;
 SELECT branch_id INTO v_branch FROM public.profiles WHERE id=auth.uid();
 IF v_branch IS NULL THEN RAISE EXCEPTION 'A physical branch must be assigned'; END IF;
 IF p_account NOT IN ('Funds','Petty Cash') OR p_type NOT IN ('Missed EOD','Late BOD','Missed Turnover') THEN RAISE EXCEPTION 'Invalid incident'; END IF;
 IF p_date IS NULL OR p_date>v_now OR p_date<v_now-60 THEN RAISE EXCEPTION 'Invalid incident date'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<4 THEN RAISE EXCEPTION 'Incident explanation required'; END IF;
 IF p_signature IS NULL OR split_part(p_signature,'/',1)<>auth.uid()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_signature) THEN RAISE EXCEPTION 'Valid signed evidence required'; END IF;
 IF p_type='Missed EOD' AND NOT EXISTS (SELECT 1 FROM public.daily_cash_counts WHERE branch_id=v_branch AND cash_account=p_account AND business_date=p_date AND count_type='BOD') THEN RAISE EXCEPTION 'No previous BOD record for missed EOD'; END IF;
 IF p_type='Missed EOD' AND EXISTS (SELECT 1 FROM public.daily_cash_counts WHERE branch_id=v_branch AND cash_account=p_account AND business_date=p_date AND count_type='EOD') THEN RAISE EXCEPTION 'EOD already submitted'; END IF;
 IF p_type='Late BOD' AND (p_date<>v_now OR (now() AT TIME ZONE 'Asia/Manila')::time<time '09:30') THEN RAISE EXCEPTION 'BOD is not overdue'; END IF;
 INSERT INTO public.cash_incident_reports(branch_id,actor_id,cash_account,incident_type,business_date,reason,signature_path)
 VALUES(v_branch,auth.uid(),p_account,p_type,p_date,btrim(p_reason),p_signature)
 RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'incident',v_id::text,'Submitted '||p_type,jsonb_build_object('account',p_account,'date',p_date,'branch',v_branch));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_cash_incident(text,text,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_cash_incident(text,text,date,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.review_cash_incident(p_id uuid,p_action text,p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.cash_incident_reports%ROWTYPE;
BEGIN
 PERFORM private.assert_active();
 SELECT * INTO v FROM public.cash_incident_reports WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Incident not found'; END IF;
 IF NOT(private.is_super() OR private.is_bm() AND v.branch_id=private.my_branch() OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='Admin')) THEN RAISE EXCEPTION 'Reviewer access required'; END IF;
 IF v.actor_id=auth.uid() THEN RAISE EXCEPTION 'Cannot review own report'; END IF;
 IF p_action NOT IN ('Acknowledged','Submit Explanation','Escalated','Resolved') THEN RAISE EXCEPTION 'Invalid review action'; END IF;
 IF p_action IN ('Submit Explanation','Escalated','Resolved') AND length(btrim(coalesce(p_note,'')))<4 THEN RAISE EXCEPTION 'Review note required'; END IF;
 UPDATE public.cash_incident_reports SET status=p_action,reviewed_at=now(),reviewed_by=auth.uid(),review_note=p_note WHERE id=p_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'incident',p_id::text,p_action,jsonb_build_object('note',p_note));
END $$;
REVOKE ALL ON FUNCTION public.review_cash_incident(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_cash_incident(uuid,text,text) TO authenticated;
-- Cashier may respond to a manager's explanation request without changing recorded money.
CREATE OR REPLACE FUNCTION public.reply_cash_incident(p_id uuid,p_explanation text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.cash_incident_reports%ROWTYPE;
BEGIN
 PERFORM private.assert_active();
 SELECT * INTO v FROM public.cash_incident_reports WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.actor_id<>auth.uid() OR v.status<>'Submit Explanation' THEN RAISE EXCEPTION 'Incident cannot be updated by this account'; END IF;
 IF length(btrim(coalesce(p_explanation,'')))<4 THEN RAISE EXCEPTION 'Explanation is required'; END IF;
 UPDATE public.cash_incident_reports SET status='Pending BM Review',reason=v.reason||E'\nFOLLOW-UP: '||btrim(p_explanation) WHERE id=p_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'incident',p_id::text,'Explanation submitted',jsonb_build_object('explanation',p_explanation));
END $$;
REVOKE ALL ON FUNCTION public.reply_cash_incident(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reply_cash_incident(uuid,text) TO authenticated;
-- Automatically create a distinct discrepancy incident when a BOD mismatch is reported.
CREATE OR REPLACE FUNCTION private.mirror_bod_discrepancy_ir() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.daily_cash_counts%ROWTYPE;
BEGIN
 SELECT * INTO c FROM public.daily_cash_counts WHERE id=NEW.count_id;
 IF c.count_type='BOD' THEN
  INSERT INTO public.cash_incident_reports(branch_id,actor_id,cash_account,incident_type,business_date,reason,signature_path,linked_count_id)
  VALUES(c.branch_id,c.actor_id,c.cash_account,'BOD Discrepancy',c.business_date,NEW.explanation,c.signature_path,c.id)
  ON CONFLICT (branch_id,cash_account,incident_type,business_date) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mirror_bod_discrepancy_ir ON public.branch_discrepancies;
CREATE TRIGGER mirror_bod_discrepancy_ir AFTER INSERT ON public.branch_discrepancies FOR EACH ROW EXECUTE FUNCTION private.mirror_bod_discrepancy_ir();
-- New policy: submission of an IR is enough to proceed after signed BOD, without BM approval.
CREATE OR REPLACE FUNCTION private.require_opening_cash_count() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='BOD' AND c.business_date=v_day)
 THEN RAISE EXCEPTION 'Complete today''s % BOD before posting cash',NEW.account; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='EOD' AND c.business_date=v_day) THEN RAISE EXCEPTION 'Day is closed. Await next BOD'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='BOD' AND c.business_date=v_day AND abs(c.difference)>0.005)
 AND NOT EXISTS(SELECT 1 FROM public.cash_incident_reports i WHERE i.branch_id=NEW.branch_id AND i.cash_account=NEW.account AND i.incident_type='BOD Discrepancy' AND i.business_date=v_day)
 THEN RAISE EXCEPTION 'BOD discrepancy incident report required'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=NEW.branch_id AND c.cash_account=NEW.account AND c.count_type='BOD' AND c.business_date<v_day
 AND NOT EXISTS(SELECT 1 FROM public.daily_cash_counts e WHERE e.branch_id=c.branch_id AND e.cash_account=c.cash_account AND e.business_date=c.business_date AND e.count_type='EOD')
 AND NOT EXISTS(SELECT 1 FROM public.cash_incident_reports i WHERE i.branch_id=c.branch_id AND i.cash_account=c.cash_account AND i.incident_type='Missed EOD' AND i.business_date=c.business_date))
 THEN RAISE EXCEPTION 'Submit all outstanding missed EOD incident reports before transactions'; END IF;
 RETURN NEW;
END $$;
-- Enforce late-BOD and missed-EOD incident filing on the server, not only the UI.
CREATE OR REPLACE FUNCTION public.submit_daily_count(p_account text,p_type text,p_actual numeric,p_signature text,p_explanation text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date; v_branch uuid;
BEGIN
 PERFORM private.assert_active();
 SELECT branch_id INTO v_branch FROM public.profiles WHERE id=auth.uid();
 IF p_type='EOD' AND (now() AT TIME ZONE 'Asia/Manila')::time < time '16:00' THEN
  RAISE EXCEPTION 'EOD unlocks at 4:00 PM Philippine time';
 END IF;
 IF p_type='BOD' THEN
  IF (now() AT TIME ZONE 'Asia/Manila')::time>=time '09:30' AND
   NOT EXISTS(SELECT 1 FROM public.cash_incident_reports WHERE branch_id=v_branch AND cash_account=p_account AND incident_type='Late BOD' AND business_date=v_day) THEN
   RAISE EXCEPTION 'Late BOD Incident Report required after 9:30 AM';
  END IF;
  IF EXISTS(SELECT 1 FROM public.daily_cash_counts c WHERE c.branch_id=v_branch AND c.cash_account=p_account AND c.count_type='BOD' AND c.business_date<v_day
   AND NOT EXISTS(SELECT 1 FROM public.daily_cash_counts e WHERE e.branch_id=c.branch_id AND e.cash_account=c.cash_account AND e.count_type='EOD' AND e.business_date=c.business_date)
   AND NOT EXISTS(SELECT 1 FROM public.cash_incident_reports i WHERE i.branch_id=c.branch_id AND i.cash_account=c.cash_account AND i.incident_type='Missed EOD' AND i.business_date=c.business_date)) THEN
   RAISE EXCEPTION 'Submit outstanding missed EOD Incident Reports before BOD';
  END IF;
 END IF;
 RETURN public.submit_daily_count_internal(p_account,p_type,p_actual,p_signature,p_explanation);
END $$;
REVOKE ALL ON FUNCTION public.submit_daily_count(text,text,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_daily_count(text,text,numeric,text,text) TO authenticated;
-- Prevent POS from bypassing the Funds cash-account opening/closing guard.
-- Non-cash payments may still be recorded independently.
CREATE OR REPLACE FUNCTION private.require_funds_bod_for_pos_cash() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_has_cash boolean;
BEGIN
 IF TG_OP='UPDATE' AND NEW.payments IS NOT DISTINCT FROM OLD.payments THEN RETURN NEW; END IF;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.payments,'[]'::jsonb)) v WHERE v->>'method'='Cash') INTO v_has_cash;
 IF NOT v_has_cash THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=NEW.branch_id AND cash_account='Funds' AND count_type='BOD' AND business_date=v_day) THEN RAISE EXCEPTION 'Funds BOD required before accepting cash payment in POS'; END IF;
 IF EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=NEW.branch_id AND cash_account='Funds' AND count_type='EOD' AND business_date=v_day) THEN RAISE EXCEPTION 'Funds EOD already completed; cash payment is locked'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pos_cash_opening_gate ON public.pos_accounts;
CREATE TRIGGER pos_cash_opening_gate BEFORE INSERT OR UPDATE OF payments ON public.pos_accounts
FOR EACH ROW EXECUTE FUNCTION private.require_funds_bod_for_pos_cash();
-- Weekly sales review confirmation; sales still originates ONLY from closed POS.
CREATE TABLE IF NOT EXISTS public.weekly_sales_submissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),branch_id uuid NOT NULL REFERENCES public.branches(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),week_ending date NOT NULL,
 submitted_at timestamptz NOT NULL DEFAULT now(),late_reason text,
 UNIQUE(branch_id,week_ending)
);
ALTER TABLE public.weekly_sales_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_submissions_read ON public.weekly_sales_submissions;
CREATE POLICY sales_submissions_read ON public.weekly_sales_submissions FOR SELECT TO authenticated USING (
 actor_id=auth.uid() OR private.is_super() OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (p.role='Admin' OR (p.role='Branch Manager' AND p.branch_id=weekly_sales_submissions.branch_id)))
);
GRANT SELECT ON public.weekly_sales_submissions TO authenticated;
CREATE OR REPLACE FUNCTION public.submit_weekly_sales(p_week_end date,p_late_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_branch uuid;v_id uuid;v_today date:=(now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
 PERFORM private.assert_active();
 SELECT branch_id INTO v_branch FROM public.profiles WHERE id=auth.uid() AND role='Cashier';
 IF v_branch IS NULL THEN RAISE EXCEPTION 'Assigned Cashier account required'; END IF;
 IF extract(isodow FROM p_week_end)<>5 OR p_week_end>v_today THEN RAISE EXCEPTION 'Choose a current or past Friday'; END IF;
 IF p_week_end<v_today AND length(btrim(coalesce(p_late_reason,'')))<4 THEN RAISE EXCEPTION 'Late sales report explanation required'; END IF;
 INSERT INTO public.weekly_sales_submissions(branch_id,actor_id,week_ending,late_reason) VALUES(v_branch,auth.uid(),p_week_end,p_late_reason) RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'weekly_sales',v_id::text,'Submitted weekly sales review',jsonb_build_object('week',p_week_end,'branch',v_branch));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_weekly_sales(date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_weekly_sales(date,text) TO authenticated;
-- Friday turnover unlock is enforced by the server at 4:00 PM Manila time.
ALTER FUNCTION public.submit_fund_turnover(numeric,text,text) RENAME TO submit_fund_turnover_internal;
REVOKE ALL ON FUNCTION public.submit_fund_turnover_internal(numeric,text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.submit_fund_turnover(p_actual numeric,p_signature text,p_proof text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF extract(isodow FROM (now() AT TIME ZONE 'Asia/Manila')::date)<>5 OR
 (now() AT TIME ZONE 'Asia/Manila')::time<time '16:00' THEN
  RAISE EXCEPTION 'Friday turnover unlocks at 4:00 PM Philippine time';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='Cashier' AND is_active=true) THEN
  RAISE EXCEPTION 'Only assigned Cashiers can submit a Funds turnover';
 END IF;
 RETURN public.submit_fund_turnover_internal(p_actual,p_signature,p_proof);
END $$;
REVOKE ALL ON FUNCTION public.submit_fund_turnover(numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_fund_turnover(numeric,text,text) TO authenticated;
-- Admin and Super Admin read all actual branches; Cashier/BM stay branch-scoped.
-- The ALL BRANCHES marker is never treated as a physical cash account.
DROP POLICY IF EXISTS branches_read ON public.branches;
CREATE POLICY branches_read ON public.branches FOR SELECT TO authenticated USING (private.is_admin() OR id=private.my_branch());
DROP POLICY IF EXISTS cash_read ON public.cash_transactions;
CREATE POLICY cash_read ON public.cash_transactions FOR SELECT TO authenticated USING (private.is_admin() OR branch_id=private.my_branch());
DROP POLICY IF EXISTS pos_read ON public.pos_accounts;
CREATE POLICY pos_read ON public.pos_accounts FOR SELECT TO authenticated USING (private.is_admin() OR branch_id=private.my_branch());
DROP POLICY IF EXISTS counts_read ON public.daily_cash_counts;
CREATE POLICY counts_read ON public.daily_cash_counts FOR SELECT TO authenticated USING (private.is_admin() OR branch_id=private.my_branch());
DROP POLICY IF EXISTS discrepancy_read ON public.branch_discrepancies;
CREATE POLICY discrepancy_read ON public.branch_discrepancies FOR SELECT TO authenticated USING (private.is_admin() OR branch_id=private.my_branch());
DROP POLICY IF EXISTS turnover_read ON public.fund_turnovers;
CREATE POLICY turnover_read ON public.fund_turnovers FOR SELECT TO authenticated USING (private.is_admin() OR branch_id=private.my_branch());
DROP POLICY IF EXISTS liquidation_read ON public.petty_liquidations;
CREATE POLICY liquidation_read ON public.petty_liquidations FOR SELECT TO authenticated USING (private.is_admin() OR branch_id=private.my_branch());
DROP POLICY IF EXISTS profile_branch_read ON public.profiles;
CREATE POLICY profile_branch_read ON public.profiles FOR SELECT TO authenticated USING (id=auth.uid() OR private.is_admin() OR branch_id=private.my_branch());
COMMIT;
