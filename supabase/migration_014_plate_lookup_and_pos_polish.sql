-- CMS v14 plate lookup + POS polish support.
-- Run AFTER migration_013_role_scope_and_reporting.sql.
-- Canonicalizes plate numbers to uppercase alphanumeric values so historical
-- transactions can be matched reliably even when users previously entered
-- spaces or dashes (ABC-1234 / ABC 1234 / abc1234 -> ABC1234).
BEGIN;

CREATE OR REPLACE FUNCTION private.normalize_plate(p_plate text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path=''
AS $$
  SELECT upper(regexp_replace(coalesce(p_plate,''),'[^A-Za-z0-9]','','g'))
$$;

REVOKE ALL ON FUNCTION private.normalize_plate(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.normalize_plate(text) TO authenticated;

-- Normalize legacy records once so plate history is consistent.
UPDATE public.pos_accounts
SET plate=private.normalize_plate(plate)
WHERE plate IS DISTINCT FROM private.normalize_plate(plate);

-- Keep future direct inserts/updates canonical even when they do not pass
-- through the web form.
CREATE OR REPLACE FUNCTION private.normalize_pos_plate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  NEW.plate:=private.normalize_plate(NEW.plate);
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.normalize_pos_plate() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.normalize_pos_plate() TO authenticated;

DROP TRIGGER IF EXISTS normalize_pos_plate ON public.pos_accounts;
CREATE TRIGGER normalize_pos_plate
BEFORE INSERT OR UPDATE OF plate ON public.pos_accounts
FOR EACH ROW EXECUTE FUNCTION private.normalize_pos_plate();

CREATE INDEX IF NOT EXISTS pos_accounts_plate_lookup_idx
ON public.pos_accounts(plate);

COMMIT;
