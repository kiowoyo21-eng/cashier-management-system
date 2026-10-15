-- CMS v13 role-scope and reporting hardening.
-- Run AFTER migration_012_master_revision.sql.
-- Keeps Cashier limited to Sales + Revolving Fund, PB limited to RFP,
-- hardens server-side write/read permissions, and protects system transaction numbering.
BEGIN;

-- ---------------------------------------------------------------------------
-- Transaction numbers: roles may only request references for workflows they own.
-- ---------------------------------------------------------------------------
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
 IF v_prefix NOT IN ('POS','RF-EXP','RF-REP','RFP-EXP','RFP-REP','RFP-HO','CC','OCC','CCC','SALES-HO') THEN
  RAISE EXCEPTION 'Invalid transaction prefix';
 END IF;
 IF v_role='Cashier' AND v_prefix NOT IN ('POS','RF-EXP','RF-REP','CC','OCC','CCC','SALES-HO') THEN
  RAISE EXCEPTION 'Cashier transaction number not allowed for this workflow';
 END IF;
 IF v_role='PB' AND v_prefix NOT IN ('RFP-EXP','RFP-REP','RFP-HO','CC','OCC','CCC') THEN
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

-- ---------------------------------------------------------------------------
-- Finance write guards. SECURITY DEFINER RPCs must not rely on UI permissions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.cash_role_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;v_branch uuid;v_expected_prefix text;
BEGIN
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role IS NULL THEN RAISE EXCEPTION 'Active account required'; END IF;
 IF NEW.account='Petty Cash' AND v_role NOT IN ('Cashier','Admin','Branch Manager','Super Admin') THEN
  RAISE EXCEPTION 'Revolving Fund is restricted to Cashier or authorized management';
 END IF;
 IF NEW.account='Funds' AND v_role NOT IN ('PB','Admin','Branch Manager','Super Admin') THEN
  RAISE EXCEPTION 'RFP is restricted to PB or authorized management';
 END IF;
 IF v_role IN ('Cashier','PB','Branch Manager') AND NEW.branch_id IS DISTINCT FROM v_branch THEN
  RAISE EXCEPTION 'Transaction branch does not match your assigned branch';
 END IF;
 v_expected_prefix:=CASE
  WHEN NEW.account='Petty Cash' AND NEW.kind='Expense' THEN 'RF-EXP-'
  WHEN NEW.account='Petty Cash' AND NEW.kind='Additional Funds' THEN 'RF-REP-'
  WHEN NEW.account='Funds' AND NEW.kind='Expense' THEN 'RFP-EXP-'
  WHEN NEW.account='Funds' AND NEW.kind='Additional Funds' THEN 'RFP-REP-'
  ELSE '' END;
 IF v_expected_prefix<>'' AND NEW.id NOT LIKE v_expected_prefix||'%' THEN
  RAISE EXCEPTION 'Invalid transaction number for this fund activity';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.cash_role_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.cash_role_guard() TO authenticated;
DROP TRIGGER IF EXISTS cash_role_guard ON public.cash_transactions;
CREATE TRIGGER cash_role_guard BEFORE INSERT OR UPDATE ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION private.cash_role_guard();

CREATE OR REPLACE FUNCTION private.pos_role_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;v_branch uuid;
BEGIN
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role NOT IN ('Cashier','Admin','Branch Manager','Super Admin') THEN
  RAISE EXCEPTION 'POS / Sales activity is restricted to Cashier or authorized management';
 END IF;
 IF TG_OP='INSERT' AND NEW.id NOT LIKE 'POS-%' THEN RAISE EXCEPTION 'Invalid POS transaction number'; END IF;
 IF v_role IN ('Cashier','Branch Manager') AND NEW.branch_id IS DISTINCT FROM v_branch THEN
  RAISE EXCEPTION 'POS branch does not match your assigned branch';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.pos_role_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.pos_role_guard() TO authenticated;
DROP TRIGGER IF EXISTS pos_role_guard ON public.pos_accounts;
CREATE TRIGGER pos_role_guard BEFORE INSERT OR UPDATE ON public.pos_accounts
FOR EACH ROW EXECUTE FUNCTION private.pos_role_guard();

-- Expense category creation follows the same role ownership as its fund.
CREATE OR REPLACE FUNCTION public.add_expense_category(p_account text,p_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;v_name text:=regexp_replace(trim(coalesce(p_name,'')),'\s+',' ','g');v_role text;
BEGIN
 PERFORM private.assert_active();
 SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
 IF p_account NOT IN ('Petty Cash','Funds') OR length(v_name)<2 OR length(v_name)>100 THEN RAISE EXCEPTION 'Invalid category'; END IF;
 IF p_account='Petty Cash' AND v_role NOT IN ('Cashier','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'Revolving Fund category access required'; END IF;
 IF p_account='Funds' AND v_role NOT IN ('PB','Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'RFP category access required'; END IF;
 SELECT id INTO v_id FROM public.expense_categories WHERE account=p_account AND normalized_name=lower(v_name);
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 INSERT INTO public.expense_categories(account,name,created_by) VALUES(p_account,v_name,auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.add_expense_category(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_expense_category(text,text) TO authenticated;

-- Supplier directory is purchasing/management support; never a Cashier/PB write workflow.
CREATE OR REPLACE FUNCTION private.supplier_role_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text;v_branch uuid;
BEGIN
 SELECT role,branch_id INTO v_role,v_branch FROM public.profiles WHERE id=auth.uid() AND is_active=true;
 IF v_role NOT IN ('Admin','Branch Manager','Super Admin') THEN RAISE EXCEPTION 'Supplier management requires authorized management access'; END IF;
 IF v_role='Branch Manager' AND NEW.branch_id IS DISTINCT FROM v_branch THEN RAISE EXCEPTION 'Supplier branch does not match your assigned branch'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.supplier_role_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.supplier_role_guard() TO authenticated;
DROP TRIGGER IF EXISTS supplier_role_guard ON public.suppliers;
CREATE TRIGGER supplier_role_guard BEFORE INSERT OR UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION private.supplier_role_guard();

-- Daily Sales Handover IDs are system transaction numbers, not arbitrary text.
CREATE OR REPLACE FUNCTION private.sales_handover_id_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.id NOT LIKE 'SALES-HO-%' THEN RAISE EXCEPTION 'Invalid Daily Sales Handover transaction number'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sales_handover_id_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.sales_handover_id_guard() TO authenticated;
DROP TRIGGER IF EXISTS sales_handover_id_guard ON public.daily_sales_handovers;
CREATE TRIGGER sales_handover_id_guard BEFORE INSERT OR UPDATE ON public.daily_sales_handovers
FOR EACH ROW EXECUTE FUNCTION private.sales_handover_id_guard();

-- ---------------------------------------------------------------------------
-- Read policies match operational ownership. Management can still supervise.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS cash_read ON public.cash_transactions;
CREATE POLICY cash_read ON public.cash_transactions FOR SELECT TO authenticated USING(
 private.is_admin()
 OR (private.my_role()='Branch Manager' AND branch_id=private.my_branch())
 OR (private.my_role()='Cashier' AND branch_id=private.my_branch() AND account='Petty Cash')
 OR (private.my_role()='PB' AND branch_id=private.my_branch() AND account='Funds')
);

DROP POLICY IF EXISTS pos_read ON public.pos_accounts;
CREATE POLICY pos_read ON public.pos_accounts FOR SELECT TO authenticated USING(
 private.is_admin()
 OR (private.my_role()='Branch Manager' AND branch_id=private.my_branch())
 OR (private.my_role()='Cashier' AND branch_id=private.my_branch())
);

DROP POLICY IF EXISTS expense_categories_read ON public.expense_categories;
CREATE POLICY expense_categories_read ON public.expense_categories FOR SELECT TO authenticated USING(
 private.is_admin()
 OR private.my_role()='Branch Manager'
 OR (private.my_role()='Cashier' AND account='Petty Cash')
 OR (private.my_role()='PB' AND account='Funds')
);

DROP POLICY IF EXISTS suppliers_read ON public.suppliers;
CREATE POLICY suppliers_read ON public.suppliers FOR SELECT TO authenticated USING(
 private.is_admin() OR (private.my_role()='Branch Manager' AND branch_id=private.my_branch())
);

DROP POLICY IF EXISTS counts_read ON public.daily_cash_counts;
CREATE POLICY counts_read ON public.daily_cash_counts FOR SELECT TO authenticated USING(
 private.is_admin()
 OR private.is_hr()
 OR (private.my_role()='Branch Manager' AND branch_id=private.my_branch())
 OR (private.my_role()='Cashier' AND branch_id=private.my_branch() AND cash_account IN ('Sales','Petty Cash'))
 OR (private.my_role()='PB' AND branch_id=private.my_branch() AND cash_account='Funds')
);

DROP POLICY IF EXISTS turnover_read ON public.fund_turnovers;
DROP POLICY IF EXISTS rfp_handover_read ON public.fund_turnovers;
CREATE POLICY rfp_handover_read ON public.fund_turnovers FOR SELECT TO authenticated USING(
 private.is_admin()
 OR (private.my_role()='Branch Manager' AND branch_id=private.my_branch())
 OR (private.my_role()='PB' AND branch_id=private.my_branch())
);

DROP POLICY IF EXISTS incidents_read ON public.cash_incident_reports;
CREATE POLICY incidents_read ON public.cash_incident_reports FOR SELECT TO authenticated USING(
 private.is_admin()
 OR private.is_hr()
 OR (private.my_role()='Branch Manager' AND branch_id=private.my_branch())
 OR (actor_id=auth.uid() AND (
      (private.my_role()='Cashier' AND cash_account IN ('Sales','Petty Cash'))
      OR (private.my_role()='PB' AND cash_account='Funds')
 ))
);

COMMIT;
