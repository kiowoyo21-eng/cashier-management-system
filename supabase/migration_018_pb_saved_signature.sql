-- V7.4: PB saved signature for RFP disbursement requests.
-- Run AFTER migration_017_pb_rfp_only_no_cash_counts.sql.
BEGIN;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS saved_signature_path text;

CREATE OR REPLACE FUNCTION public.save_my_signature(p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE v_role text;
BEGIN
  PERFORM private.assert_active();
  SELECT role INTO v_role FROM public.profiles WHERE id=auth.uid();
  IF v_role NOT IN ('PB','Admin','Branch Manager','Super Admin') THEN
    RAISE EXCEPTION 'Saved signature is available only to PB or authorized management';
  END IF;
  IF p_path IS NULL OR split_part(p_path,'/',1)<>auth.uid()::text THEN
    RAISE EXCEPTION 'Invalid signature path';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM storage.objects
    WHERE bucket_id='transaction-evidence' AND name=p_path
  ) THEN
    RAISE EXCEPTION 'Saved signature file was not found';
  END IF;
  UPDATE public.profiles SET saved_signature_path=p_path WHERE id=auth.uid();
  INSERT INTO public.audit_logs(actor_id,entity_type,entity_id,action,detail)
  VALUES(auth.uid(),'profile',auth.uid()::text,'Saved signature updated','{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.save_my_signature(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_my_signature(text) TO authenticated;

COMMIT;
