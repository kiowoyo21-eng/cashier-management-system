-- CMS v13 patch. Run after migrations 022 and 023. Existing history is untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS public.rfp_part_pos_links (
 cash_transaction_id text PRIMARY KEY REFERENCES public.cash_transactions(id),
 pos_id text NOT NULL REFERENCES public.pos_accounts(id),
 linked_at timestamptz NOT NULL DEFAULT now(),
 linked_by uuid REFERENCES public.profiles(id),
 link_source text NOT NULL CHECK (link_source IN ('auto','PB selection'))
);
CREATE INDEX IF NOT EXISTS rfp_part_pos_links_pos ON public.rfp_part_pos_links(pos_id);
ALTER TABLE public.rfp_part_pos_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rfp_part_pos_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.rfp_part_pos_links TO authenticated;
DROP POLICY IF EXISTS rfp_part_pos_link_read ON public.rfp_part_pos_links;
CREATE POLICY rfp_part_pos_link_read ON public.rfp_part_pos_links FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM public.profiles u WHERE u.id=auth.uid() AND u.is_active AND
 (u.role IN ('PB','Admin','Super Admin') OR (u.role IN ('Cashier','Branch Manager') AND u.branch_id=(SELECT p.branch_id FROM public.pos_accounts p WHERE p.id=pos_id)))));

-- Block Supply/Transportation/etc. from NEW RFP expense submissions only.
CREATE OR REPLACE FUNCTION private.rfp_parts_only_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.account='Funds' AND NEW.kind='Expense' AND NEW.category IS DISTINCT FROM 'Part' THEN
  RAISE EXCEPTION 'RFP is Parts only; record transport/operating costs under Revolving Fund';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_rfp_parts_only_insert ON public.cash_transactions;
CREATE TRIGGER zz_rfp_parts_only_insert BEFORE INSERT ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION private.rfp_parts_only_guard();

CREATE OR REPLACE FUNCTION public.link_rfp_part_to_pos(p_cash_id text,p_pos_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cash_transactions%ROWTYPE;p public.pos_accounts%ROWTYPE;v_role text;v_plate text;
BEGIN
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role IS DISTINCT FROM 'PB' THEN RAISE EXCEPTION 'Only PB can pin RFP parts'; END IF;
 SELECT * INTO c FROM public.cash_transactions WHERE id=p_cash_id FOR UPDATE;
 SELECT * INTO p FROM public.pos_accounts WHERE id=p_pos_id FOR UPDATE;
 IF c.id IS NULL OR c.account<>'Funds' OR c.kind<>'Expense' OR c.category<>'Part' THEN RAISE EXCEPTION 'Valid RFP parts expense required'; END IF;
 IF p.id IS NULL OR p.status<>'Pending' THEN RAISE EXCEPTION 'Select a Pending POS; a Closed POS needs an approved correction or extension'; END IF;
 IF c.branch_id IS DISTINCT FROM p.branch_id THEN RAISE EXCEPTION 'POS and parts must belong to the same branch'; END IF;
 v_plate:=upper(regexp_replace(coalesce(c.plate_number,''),'[^A-Za-z0-9]','','g'));
 IF v_plate IN ('','NA','NONE','SHOP') OR v_plate<>upper(regexp_replace(coalesce(p.plate,''),'[^A-Za-z0-9]','','g')) THEN RAISE EXCEPTION 'Plate numbers do not match'; END IF;
 INSERT INTO public.rfp_part_pos_links(cash_transaction_id,pos_id,linked_by,link_source) VALUES(p_cash_id,p_pos_id,auth.uid(),'PB selection');
 INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
 VALUES(auth.uid(),'rfp_part_pos_link',p_cash_id,'PB pinned part to POS',jsonb_build_object('pos_id',p_pos_id,'amount',c.amount));
END $$;
REVOKE ALL ON FUNCTION public.link_rfp_part_to_pos(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.link_rfp_part_to_pos(text,text) TO authenticated;

-- Automatic association is deliberately limited to ONE matching open POS.
CREATE OR REPLACE FUNCTION private.auto_pin_rfp_part(p_cash_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cash_transactions%ROWTYPE;v_plate text;v_count integer;v_pos text;
BEGIN
 SELECT * INTO c FROM public.cash_transactions WHERE id=p_cash_id;
 IF c.id IS NULL OR c.account<>'Funds' OR c.kind<>'Expense' OR c.category<>'Part' OR c.branch_id IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.rfp_part_pos_links WHERE cash_transaction_id=p_cash_id) THEN RETURN; END IF;
 v_plate:=upper(regexp_replace(coalesce(c.plate_number,''),'[^A-Za-z0-9]','','g'));
 IF v_plate IN ('','NA','NONE','SHOP') THEN RETURN; END IF;
 SELECT count(*),min(p.id) INTO v_count,v_pos FROM public.pos_accounts p
 WHERE p.branch_id=c.branch_id AND p.status='Pending'
 AND upper(regexp_replace(coalesce(p.plate,''),'[^A-Za-z0-9]','','g'))=v_plate;
 IF v_count=1 THEN
  INSERT INTO public.rfp_part_pos_links(cash_transaction_id,pos_id,link_source)
  VALUES(p_cash_id,v_pos,'auto') ON CONFLICT(cash_transaction_id) DO NOTHING;
  IF FOUND THEN
   INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
   VALUES(c.actor_id,'rfp_part_pos_link',p_cash_id,'Auto-pinned part to POS',jsonb_build_object('pos_id',v_pos));
  END IF;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION private.auto_pin_rfp_cash_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM private.auto_pin_rfp_part(NEW.id);RETURN NEW;END $$;
DROP TRIGGER IF EXISTS zz_auto_pin_rfp_cash ON public.cash_transactions;
CREATE TRIGGER zz_auto_pin_rfp_cash AFTER INSERT ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION private.auto_pin_rfp_cash_trigger();

CREATE OR REPLACE FUNCTION private.auto_pin_rfp_pos_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id text;v_plate text;
BEGIN
 IF NEW.status<>'Pending' THEN RETURN NEW; END IF;
 v_plate:=upper(regexp_replace(coalesce(NEW.plate,''),'[^A-Za-z0-9]','','g'));
 IF v_plate IN ('','NA','NONE','SHOP') THEN RETURN NEW; END IF;
 FOR v_id IN SELECT c.id FROM public.cash_transactions c WHERE c.account='Funds' AND c.kind='Expense'
 AND c.category='Part' AND c.branch_id=NEW.branch_id
 AND upper(regexp_replace(coalesce(c.plate_number,''),'[^A-Za-z0-9]','','g'))=v_plate
 AND NOT EXISTS(SELECT 1 FROM public.rfp_part_pos_links l WHERE l.cash_transaction_id=c.id)
 LOOP PERFORM private.auto_pin_rfp_part(v_id);END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_auto_pin_rfp_pos ON public.pos_accounts;
CREATE TRIGGER zz_auto_pin_rfp_pos AFTER INSERT ON public.pos_accounts
FOR EACH ROW EXECUTE FUNCTION private.auto_pin_rfp_pos_trigger();
-- PB may locate Pending POS by plate for manual pinning. Write access remains restricted.
DROP POLICY IF EXISTS pos_read ON public.pos_accounts;
CREATE POLICY pos_read ON public.pos_accounts FOR SELECT TO authenticated USING (
 private.is_admin() OR
 (private.my_role()='Branch Manager' AND branch_id=private.my_branch()) OR
 (private.my_role()='Cashier' AND branch_id=private.my_branch()) OR
 (private.my_role()='PB' AND status IN ('Pending','Closed'))
);
COMMIT;
