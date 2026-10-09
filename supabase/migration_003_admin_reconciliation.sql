-- Run ONCE after schema.sql and migration_002_pos_payments.sql.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS public.cash_reconciliations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account text NOT NULL CHECK(account IN ('Petty Cash','Funds')),
 expected numeric(14,2) NOT NULL, actual numeric(14,2) NOT NULL CHECK(actual>=0),
 difference numeric(14,2) GENERATED ALWAYS AS (actual-expected) STORED,
 note text NOT NULL DEFAULT '', actor_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reconciliation_super_select ON public.cash_reconciliations;
CREATE POLICY reconciliation_super_select ON public.cash_reconciliations FOR SELECT TO authenticated USING ((SELECT private.is_super()));
REVOKE ALL ON public.cash_reconciliations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cash_reconciliations TO authenticated;
CREATE OR REPLACE FUNCTION public.create_cash_reconciliation(p_account text,p_actual numeric,p_note text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_expected numeric(14,2); v_id uuid;
BEGIN
 IF NOT private.is_super() THEN RAISE EXCEPTION 'Super Admin required'; END IF;
 IF p_account NOT IN ('Petty Cash','Funds') OR p_actual IS NULL OR p_actual<0 OR p_actual>100000000 THEN RAISE EXCEPTION 'Invalid reconciliation details'; END IF;
 -- Operational cash-ledger balance includes Pending transactions immediately.
 SELECT COALESCE(SUM(CASE WHEN kind='Additional Funds' THEN amount ELSE -amount END),0)
 INTO v_expected FROM public.cash_transactions WHERE account=p_account;
 INSERT INTO public.cash_reconciliations(account,expected,actual,note,actor_id)
 VALUES(p_account,v_expected,p_actual,coalesce(p_note,''),auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'reconciliation',v_id::text,'Cash reconciliation created',jsonb_build_object('account',p_account,'expected',v_expected,'actual',p_actual,'note',p_note));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_cash_reconciliation(text,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_cash_reconciliation(text,numeric,text) TO authenticated;
-- Enforce active account on existing SECURITY DEFINER finance RPCs.
CREATE OR REPLACE FUNCTION private.assert_active() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN
  RAISE EXCEPTION 'Account inactive or not signed in';
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.assert_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.assert_active() TO authenticated;


-- Guard create_cash_transaction against disabled accounts
CREATE OR REPLACE FUNCTION public.create_cash_transaction(p_id text,p_account text,p_kind text,p_amount numeric,p_category text,p_description text,p_signature text,p_proof text default null)
returns void language plpgsql security definer set search_path='' as $$
BEGIN
 PERFORM private.assert_active();
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_account not in ('Petty Cash','Funds') or p_kind not in ('Additional Funds','Expense') or p_amount<=0 or p_amount>100000000 or nullif(trim(p_category),'') is null or nullif(trim(p_description),'') is null then raise exception 'Invalid transaction details'; end if;
 if p_signature is null or split_part(p_signature,'/',1)<>auth.uid()::text then raise exception 'Invalid signature attachment'; end if;
 if p_kind='Additional Funds' and p_proof is null then raise exception 'Handover photo required'; end if;
 if p_proof is not null and split_part(p_proof,'/',1)<>auth.uid()::text then raise exception 'Invalid proof attachment'; end if;
 if not exists(select 1 from storage.objects where bucket_id='transaction-evidence' and name=p_signature) then raise exception 'Signature image not found'; end if;
 if p_proof is not null and not exists(select 1 from storage.objects where bucket_id='transaction-evidence' and name=p_proof) then raise exception 'Proof image not found'; end if;
 insert into public.cash_transactions(id,account,kind,amount,category,description,actor_id,signature_path,proof_path)
 values(p_id,p_account,p_kind,p_amount,p_category,p_description,auth.uid(),p_signature,p_proof);
 insert into public.audit_logs(actor_id,entity_type,entity_id,action) values(auth.uid(),'cash',p_id,'Created; balance adjusted; Pending for Approval');
end $$;

-- Guard attach_cash_proof against disabled accounts
CREATE OR REPLACE FUNCTION public.attach_cash_proof(p_id text,p_path text) returns void language plpgsql security definer set search_path='' as $$
declare v public.cash_transactions%rowtype;
BEGIN
 PERFORM private.assert_active();
 select * into v from public.cash_transactions where id=p_id for update;
 if not found or v.actor_id<>auth.uid() or v.kind<>'Expense' or v.proof_path is not null then raise exception 'Proof cannot be attached'; end if;
 if split_part(p_path,'/',1)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='transaction-evidence' and name=p_path) then raise exception 'Invalid proof'; end if;
 update public.cash_transactions set proof_path=p_path where id=p_id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action) values(auth.uid(),'cash',p_id,'Receipt proof attached');
end $$;

-- Guard review_cash against disabled accounts
CREATE OR REPLACE FUNCTION public.review_cash(p_id text,p_action text,p_note text default null) returns void language plpgsql security definer set search_path='' as $$
declare v public.cash_transactions%rowtype;
BEGIN
 PERFORM private.assert_active();
 if not private.is_admin() then raise exception 'Admin access required'; end if;
 select * into v from public.cash_transactions where id=p_id for update;
 if not found or v.status<>'Pending for Approval' then raise exception 'Invalid review status'; end if;
 if v.actor_id=auth.uid() then raise exception 'Cannot approve or review own cash transaction'; end if;
 if p_action='approve' then
  if v.proof_path is null then raise exception 'Receipt proof required'; end if;
  update public.cash_transactions set status='Approved' where id=p_id;
 elsif p_action='request' then
  if nullif(trim(p_note),'') is null then raise exception 'Review reason required'; end if;
  update public.cash_transactions set status='Submit Explanation',reviewer_note=p_note where id=p_id;
 else raise exception 'Invalid action'; end if;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail) values(auth.uid(),'cash',p_id,p_action,jsonb_build_object('note',p_note));
end $$;

-- Guard explain_cash against disabled accounts
CREATE OR REPLACE FUNCTION public.explain_cash(p_id text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare v public.cash_transactions%rowtype;
BEGIN
 PERFORM private.assert_active();
 select * into v from public.cash_transactions where id=p_id for update;
 if not found or v.actor_id<>auth.uid() or v.status<>'Submit Explanation' or nullif(trim(p_note),'') is null then raise exception 'Explanation not allowed'; end if;
 update public.cash_transactions set status='Pending for Approval',explanation=p_note where id=p_id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail) values(auth.uid(),'cash',p_id,'Explanation submitted',jsonb_build_object('explanation',p_note));
end $$;

-- Guard create_pos against disabled accounts
CREATE OR REPLACE FUNCTION public.create_pos(p_id text,p_client text,p_phone text,p_vehicle text,p_plate text,p_concern text,p_items jsonb,p_payments jsonb,p_costs numeric) returns void language plpgsql security definer set search_path='' as $$
declare j jsonb; v_total numeric:=0; v_paid numeric:=0;
BEGIN
 PERFORM private.assert_active();
 if auth.uid() is null or nullif(trim(p_client),'') is null or nullif(trim(p_vehicle),'') is null or p_costs<0 or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_typeof(p_payments)<>'array' then raise exception 'Invalid POS data'; end if;
 for j in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(j->'name')<>'string' or (j->>'qty')::numeric<=0 or (j->>'price')::numeric<0 then raise exception 'Invalid POS item'; end if;
  v_total:=v_total+(j->>'qty')::numeric*(j->>'price')::numeric;
 end loop;
 for j in select value from jsonb_array_elements(p_payments) loop
  if (j->>'amount')::numeric<=0 or nullif(j->>'method','') is null then raise exception 'Invalid payment'; end if;
  v_paid:=v_paid+(j->>'amount')::numeric;
 end loop;
 if v_paid>v_total then raise exception 'Overpayment is not allowed'; end if;
 insert into public.pos_accounts(id,actor_id,client,phone,vehicle,plate,concern,items,payments,costs)
 values(p_id,auth.uid(),p_client,coalesce(p_phone,''),p_vehicle,coalesce(p_plate,''),coalesce(p_concern,''),p_items,p_payments,p_costs);
 insert into public.audit_logs(actor_id,entity_type,entity_id,action) values(auth.uid(),'pos',p_id,'POS created as Pending');
end $$;

-- Guard close_pos against disabled accounts
CREATE OR REPLACE FUNCTION public.close_pos(p_id text) returns void language plpgsql security definer set search_path='' as $$
declare v public.pos_accounts%rowtype; due numeric; paid numeric;
BEGIN
 PERFORM private.assert_active();
 select * into v from public.pos_accounts where id=p_id for update;
 if not found or v.status<>'Pending' then raise exception 'Not a pending POS'; end if;
 select coalesce(sum((x->>'qty')::numeric*(x->>'price')::numeric),0) into due from jsonb_array_elements(v.items) x;
 select coalesce(sum((x->>'amount')::numeric),0) into paid from jsonb_array_elements(v.payments) x;
 if abs(due-paid)>0.005 then raise exception 'Full payment required to close'; end if;
 update public.pos_accounts set status='Closed',closed_at=now() where id=p_id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action) values(auth.uid(),'pos',p_id,'Account closed; automatically visible in Sales');
end $$;

-- Guard add_pos_payment against disabled accounts
create or replace function public.add_pos_payment(p_id text,p_amount numeric,p_method text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.pos_accounts%rowtype; due numeric; paid numeric;
BEGIN
 PERFORM private.assert_active();
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into v from public.pos_accounts where id=p_id for update;
 if not found or v.status<>'Pending' then raise exception 'POS account is not pending'; end if;
 if p_amount is null or p_amount<=0 or p_amount>100000000 or nullif(trim(p_method),'') is null then raise exception 'Invalid payment'; end if;
 select coalesce(sum((x->>'qty')::numeric*(x->>'price')::numeric),0) into due from jsonb_array_elements(v.items) x;
 select coalesce(sum((x->>'amount')::numeric),0) into paid from jsonb_array_elements(v.payments) x;
 if paid+p_amount>due+0.005 then raise exception 'Overpayment is not allowed'; end if;
 update public.pos_accounts set payments=payments||jsonb_build_array(jsonb_build_object('amount',p_amount,'method',p_method,'at',now())) where id=p_id;
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,detail) values(auth.uid(),'pos',p_id,'Additional payment recorded',jsonb_build_object('amount',p_amount,'method',p_method));
end $$;
