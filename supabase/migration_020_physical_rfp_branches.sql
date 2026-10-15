-- CMS v20: RFP uses the four physical operating branches.
-- Run AFTER migration_019_rfp_parts_disbursement_approval.sql.
-- "ALL BRANCHES" is an access-scope marker only and must never be used as the
-- branch of an RFP expense transaction.
BEGIN;

INSERT INTO public.branches(name)
VALUES
 ('Mastermind Mandaluyong'),
 ('Underchargers Mandaluyong'),
 ('Underchargers Las Piñas'),
 ('Underchargers Quezon City')
ON CONFLICT(name) DO NOTHING;

-- PB/Accounting may assign an RFP entry to any real physical branch, but not
-- to the ALL BRANCHES access marker.
CREATE OR REPLACE FUNCTION private.assign_finance_branch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_role text;
 v_branch uuid;
 v_release boolean:=coalesce(current_setting('app.rfp_release',true),'')='1';
 v_target_name text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authenticated account required'; END IF;
 SELECT role,branch_id INTO v_role,v_branch
 FROM public.profiles
 WHERE id=auth.uid() AND is_active;

 IF TG_TABLE_NAME='cash_transactions'
    AND NEW.account='Funds'
    AND NEW.branch_id IS NOT NULL
    AND (v_role='PB' OR (v_role='Accounting' AND v_release)) THEN
   SELECT name INTO v_target_name FROM public.branches WHERE id=NEW.branch_id;
   IF v_target_name IS NULL THEN
     RAISE EXCEPTION 'Unknown RFP branch';
   END IF;
   IF upper(btrim(v_target_name))='ALL BRANCHES' THEN
     RAISE EXCEPTION 'Select the actual branch that used the Part or Supply';
   END IF;
   IF v_target_name NOT IN (
     'Mastermind Mandaluyong',
     'Underchargers Mandaluyong',
     'Underchargers Las Piñas',
     'Underchargers Quezon City'
   ) THEN
     RAISE EXCEPTION 'Select one of the four authorized RFP branches';
   END IF;
   RETURN NEW;
 END IF;

 NEW.branch_id:=v_branch;
 IF NEW.branch_id IS NULL THEN RAISE EXCEPTION 'Assign a branch before recording transactions'; END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.assign_finance_branch() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.assign_finance_branch() TO authenticated;

COMMIT;
