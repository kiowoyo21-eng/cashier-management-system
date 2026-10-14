-- Execute once after migrations 001-004. Existing records are preserved.
BEGIN;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('Cashier','Admin','Branch Manager','Super Admin'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch_id uuid;
CREATE TABLE IF NOT EXISTS public.branches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE,
 petty_cash_limit numeric(14,2), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_branch_fk FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.pos_accounts ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);
CREATE OR REPLACE FUNCTION private.is_bm() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active AND role IN ('Branch Manager','Super Admin')) $$;
CREATE OR REPLACE FUNCTION private.my_branch() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT branch_id FROM public.profiles WHERE id=auth.uid() $$;
REVOKE ALL ON FUNCTION private.is_bm(),private.my_branch() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.is_bm(),private.my_branch() TO authenticated;
CREATE TABLE public.daily_cash_counts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), branch_id uuid NOT NULL REFERENCES public.branches(id),
 cash_account text NOT NULL CHECK(cash_account IN ('Petty Cash','Funds')),
 business_date date NOT NULL, count_type text NOT NULL CHECK(count_type IN ('BOD','EOD')),
 expected numeric(14,2) NOT NULL, actual numeric(14,2) NOT NULL CHECK(actual>=0),
 difference numeric(14,2) GENERATED ALWAYS AS(actual-expected) STORED,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 signature_path text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(branch_id,cash_account,business_date,count_type)
);
CREATE TABLE public.branch_discrepancies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),count_id uuid NOT NULL UNIQUE REFERENCES public.daily_cash_counts(id),
 branch_id uuid NOT NULL REFERENCES public.branches(id),
 cashier_id uuid NOT NULL REFERENCES public.profiles(id),
 explanation text NOT NULL CHECK(length(trim(explanation))>0),
 status text NOT NULL DEFAULT 'Pending BM Review' CHECK(status IN ('Pending BM Review','Submit Explanation','Acknowledged','Escalated','Resolved')),
 bm_note text, reviewed_by uuid REFERENCES public.profiles(id), reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fund_turnovers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),branch_id uuid NOT NULL REFERENCES public.branches(id),
 business_date date NOT NULL, expected numeric(14,2) NOT NULL,
 actual numeric(14,2) NOT NULL CHECK(actual>=0),
 cashier_id uuid NOT NULL REFERENCES public.profiles(id), receiver_id uuid REFERENCES public.profiles(id),
 cashier_signature text NOT NULL,receiver_signature text,proof_path text,
 status text NOT NULL DEFAULT 'Pending for Approval' CHECK(status IN ('Pending for Approval','Approved','Submit Explanation')),
 reviewer_note text,reviewed_by uuid REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(branch_id,business_date)
);
CREATE TABLE public.petty_liquidations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),branch_id uuid NOT NULL REFERENCES public.branches(id),
 period_start date NOT NULL,period_end date NOT NULL,generated_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(branch_id,period_start,period_end)
);
-- Branch-level restrictions for new tables. Never use client-provided branch as authority.
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_cash_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_turnovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_liquidations ENABLE ROW LEVEL SECURITY;
CREATE POLICY branches_read ON public.branches FOR SELECT TO authenticated USING (id=private.my_branch() OR private.is_super());
CREATE POLICY counts_read ON public.daily_cash_counts FOR SELECT TO authenticated USING(branch_id=private.my_branch() OR private.is_super());
CREATE POLICY discrepancy_read ON public.branch_discrepancies FOR SELECT TO authenticated USING(branch_id=private.my_branch() OR private.is_super());
CREATE POLICY turnover_read ON public.fund_turnovers FOR SELECT TO authenticated USING(branch_id=private.my_branch() OR private.is_super());
CREATE POLICY liquidation_read ON public.petty_liquidations FOR SELECT TO authenticated USING(branch_id=private.my_branch() OR private.is_super());
REVOKE ALL ON public.branches,public.daily_cash_counts,public.branch_discrepancies,public.fund_turnovers,public.petty_liquidations FROM anon,authenticated;
GRANT SELECT ON public.branches,public.daily_cash_counts,public.branch_discrepancies,public.fund_turnovers,public.petty_liquidations TO authenticated;
-- Single-row transaction locks prevent duplicate cash count submissions.
CREATE FUNCTION public.submit_daily_count(p_account text,p_type text,p_actual numeric,p_signature text,p_explanation text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_branch uuid; v_date date:=(now() AT TIME ZONE 'Asia/Manila')::date; v_expected numeric(14,2); v_id uuid; v_prior numeric(14,2); v_last date;
BEGIN
 PERFORM private.assert_active();
 SELECT branch_id INTO v_branch FROM public.profiles WHERE id=auth.uid();
 IF v_branch IS NULL THEN RAISE EXCEPTION 'An assigned branch is required'; END IF;
 IF p_account NOT IN ('Petty Cash','Funds') OR p_type NOT IN ('BOD','EOD') OR p_actual IS NULL OR p_actual<0 OR p_actual>100000000 THEN RAISE EXCEPTION 'Invalid cash count'; END IF;
 IF p_signature IS NULL OR split_part(p_signature,'/',1)<>auth.uid()::text OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_signature) THEN RAISE EXCEPTION 'Signature proof required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(v_branch::text||p_account||v_date::text));
 IF p_type='EOD' AND NOT EXISTS(SELECT 1 FROM public.daily_cash_counts WHERE branch_id=v_branch AND cash_account=p_account AND business_date=v_date AND count_type='BOD') THEN RAISE EXCEPTION 'BOD required before EOD'; END IF;
 IF p_type='BOD' THEN
  SELECT expected INTO v_prior FROM public.daily_cash_counts WHERE branch_id=v_branch AND cash_account=p_account AND count_type='EOD' AND business_date<v_date ORDER BY business_date DESC LIMIT 1;
  -- Use previous recorded EOD SYSTEM expected, not the physical count, for carry-forward.
  v_expected:=COALESCE(v_prior,0);
 ELSE
  SELECT COALESCE(SUM(CASE WHEN kind='Additional Funds' THEN amount ELSE -amount END),0) INTO v_expected FROM public.cash_transactions WHERE account=p_account AND (branch_id=v_branch OR (branch_id IS NULL AND v_branch IS NOT NULL));
  IF p_account='Funds' THEN
   SELECT v_expected + COALESCE(SUM(coalesce((payment->>'amount')::numeric,0)),0) INTO v_expected
   FROM public.pos_accounts p CROSS JOIN LATERAL jsonb_array_elements(p.payments) payment
   WHERE (p.branch_id=v_branch) AND payment->>'method'='Cash';
   SELECT v_expected-COALESCE(SUM(actual),0) INTO v_expected FROM public.fund_turnovers WHERE branch_id=v_branch;
  END IF;
 END IF;
 IF abs(p_actual-v_expected)>0.005 AND length(trim(p_explanation))=0 THEN RAISE EXCEPTION 'Discrepancy explanation is required'; END IF;
 INSERT INTO public.daily_cash_counts(branch_id,cash_account,business_date,count_type,expected,actual,actor_id,signature_path)
 VALUES(v_branch,p_account,v_date,p_type,v_expected,p_actual,auth.uid(),p_signature) RETURNING id INTO v_id;
 IF abs(p_actual-v_expected)>0.005 THEN
  INSERT INTO public.branch_discrepancies(count_id,branch_id,cashier_id,explanation) VALUES(v_id,v_branch,auth.uid(),p_explanation);
 END IF;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'daily_count',v_id::text,'Submitted '||p_type,jsonb_build_object('expected',v_expected,'actual',p_actual,'branch_id',v_branch));
 RETURN v_id;
END $$;
CREATE FUNCTION public.review_branch_discrepancy(p_id uuid,p_action text,p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.branch_discrepancies%rowtype;
BEGIN
 PERFORM private.assert_active();
 SELECT * INTO v FROM public.branch_discrepancies WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT (private.is_super() OR (private.is_bm() AND v.branch_id=private.my_branch())) THEN RAISE EXCEPTION 'Branch Manager access required'; END IF;
 IF v.cashier_id=auth.uid() THEN RAISE EXCEPTION 'Cannot review own discrepancy'; END IF;
 IF p_action NOT IN ('Acknowledged','Submit Explanation','Escalated','Resolved') THEN RAISE EXCEPTION 'Invalid review action'; END IF;
 IF p_action IN ('Submit Explanation','Escalated','Resolved') AND length(trim(p_note))=0 THEN RAISE EXCEPTION 'Review note required'; END IF;
 UPDATE public.branch_discrepancies SET status=p_action,bm_note=p_note,reviewed_by=auth.uid(),reviewed_at=now() WHERE id=p_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'branch_discrepancy',p_id::text,p_action,jsonb_build_object('note',p_note));
END $$;
CREATE FUNCTION public.submit_fund_turnover(p_actual numeric,p_signature text,p_proof text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_branch uuid;v_date date:=(now() AT TIME ZONE 'Asia/Manila')::date;v_expected numeric(14,2);v_id uuid;
BEGIN
 PERFORM private.assert_active();
 SELECT branch_id INTO v_branch FROM public.profiles WHERE id=auth.uid();
 IF v_branch IS NULL OR extract(isodow from v_date)<>5 THEN RAISE EXCEPTION 'Friday turnover requires an assigned branch'; END IF;
 IF p_actual IS NULL OR p_actual<0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
 IF p_signature IS NULL OR split_part(p_signature,'/',1)<>auth.uid()::text OR p_proof IS NULL OR split_part(p_proof,'/',1)<>auth.uid()::text THEN RAISE EXCEPTION 'Signed proof required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_signature) OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_proof) THEN RAISE EXCEPTION 'Proof not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(v_branch::text||v_date::text||'turnover'));
 SELECT COALESCE(SUM(CASE WHEN kind='Additional Funds' THEN amount ELSE -amount END),0) INTO v_expected FROM public.cash_transactions WHERE account='Funds' AND branch_id=v_branch;
 SELECT v_expected+COALESCE(SUM((payment->>'amount')::numeric),0) INTO v_expected FROM public.pos_accounts p CROSS JOIN LATERAL jsonb_array_elements(p.payments) payment WHERE p.branch_id=v_branch AND payment->>'method'='Cash';
 SELECT v_expected-COALESCE(SUM(actual),0) INTO v_expected FROM public.fund_turnovers WHERE branch_id=v_branch;
 IF p_actual>v_expected+0.005 THEN RAISE EXCEPTION 'Turnover exceeds available funds'; END IF;
 INSERT INTO public.fund_turnovers(branch_id,business_date,expected,actual,cashier_id,cashier_signature,proof_path) VALUES(v_branch,v_date,v_expected,p_actual,auth.uid(),p_signature,p_proof) RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'fund_turnover',v_id::text,'Friday turnover submitted',jsonb_build_object('expected',v_expected,'actual',p_actual));
 RETURN v_id;
END $$;
CREATE FUNCTION public.review_fund_turnover(p_id uuid,p_action text,p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.fund_turnovers%rowtype;
BEGIN
 PERFORM private.assert_active();
 SELECT * INTO v FROM public.fund_turnovers WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT (private.is_super() OR (private.is_bm() AND v.branch_id=private.my_branch())) THEN RAISE EXCEPTION 'Manager role required'; END IF;
 IF v.cashier_id=auth.uid() THEN RAISE EXCEPTION 'Cannot review own turnover'; END IF;
 IF p_action NOT IN ('Approved','Submit Explanation') THEN RAISE EXCEPTION 'Invalid status'; END IF;
 IF p_action='Submit Explanation' AND length(trim(p_note))=0 THEN RAISE EXCEPTION 'Explanation required'; END IF;
 UPDATE public.fund_turnovers SET status=p_action,reviewer_note=p_note,reviewed_by=auth.uid() WHERE id=p_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail) VALUES(auth.uid(),'fund_turnover',p_id::text,p_action,jsonb_build_object('note',p_note));
END $$;
REVOKE ALL ON FUNCTION public.submit_daily_count(text,text,numeric,text,text),public.review_branch_discrepancy(uuid,text,text),public.submit_fund_turnover(numeric,text,text),public.review_fund_turnover(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_daily_count(text,text,numeric,text,text),public.review_branch_discrepancy(uuid,text,text),public.submit_fund_turnover(numeric,text,text),public.review_fund_turnover(uuid,text,text) TO authenticated;
COMMIT;
-- Apply tenant boundaries to existing finance records as part of this migration.
-- Historical NULL branch records stay visible to Super Admin ONLY until assigned by an administrator.
BEGIN;
CREATE OR REPLACE FUNCTION private.assign_finance_branch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authenticated account required'; END IF;
 NEW.branch_id := (SELECT branch_id FROM public.profiles WHERE id=auth.uid() AND is_active);
 IF NEW.branch_id IS NULL THEN RAISE EXCEPTION 'Assign a branch before recording transactions'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cash_branch_assignment ON public.cash_transactions;
CREATE TRIGGER cash_branch_assignment BEFORE INSERT ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION private.assign_finance_branch();
DROP TRIGGER IF EXISTS pos_branch_assignment ON public.pos_accounts;
CREATE TRIGGER pos_branch_assignment BEFORE INSERT ON public.pos_accounts FOR EACH ROW EXECUTE FUNCTION private.assign_finance_branch();
DROP POLICY IF EXISTS cash_read ON public.cash_transactions;
CREATE POLICY cash_read ON public.cash_transactions FOR SELECT TO authenticated USING(private.is_super() OR (branch_id IS NOT NULL AND branch_id=private.my_branch()));
DROP POLICY IF EXISTS pos_read ON public.pos_accounts;
CREATE POLICY pos_read ON public.pos_accounts FOR SELECT TO authenticated USING(private.is_super() OR (branch_id IS NOT NULL AND branch_id=private.my_branch()));
-- Staff names can be viewed only for same-branch staff; Super Admin sees everyone.
DROP POLICY IF EXISTS profile_self ON public.profiles;
CREATE POLICY profile_branch_read ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid() OR private.is_super() OR (branch_id IS NOT NULL AND branch_id=private.my_branch()));
-- Protect cashier approvals by restricting branch at existing RPC level via RLS-visible row checks where feasible.
-- SECURITY DEFINER functions bypass RLS: enforce branch against target rows explicitly for existing actions.
-- Do not assume UI restrictions alone secure existing financial functions.
COMMIT;
