-- OPTIONAL TEST/DEMO SEED ONLY.
-- Run manually in a DEVELOPMENT / STAGING Supabase project after migration_018.
-- Do NOT run in production.
--
-- IMPORTANT: run `npm run seed:receipts` first.
-- The uploader stores demo files under the active PB user's UUID folder so
-- normal private Storage RLS allows the PB web app to create signed URLs.
--
-- Demo result:
--   Replenishment: PHP 100,000
--   Unreimbursed RFP expenses: PHP 50,000
--   Current RFP balance: PHP 50,000
--   Every seeded transaction has an actual proof attachment.

DO $$
DECLARE
  v_actor uuid;
  v_branch uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_base text;
  v_signature text;
BEGIN
  SELECT id, branch_id
  INTO v_actor, v_branch
  FROM public.profiles
  WHERE role='PB'
    AND is_active=true
    AND branch_id IS NOT NULL
  ORDER BY created_at
  LIMIT 1;

  IF v_actor IS NULL OR v_branch IS NULL THEN
    RAISE EXCEPTION 'No active PB account with an assigned branch was found. Create/assign a PB account first.';
  END IF;

  v_base := v_actor::text || '/seed-rfp';
  v_signature := v_base || '/demo-signature.png';

  -- Fail fast unless all bundled proofs were uploaded under this PB account.
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id='transaction-evidence' AND name=v_signature
  ) THEN
    RAISE EXCEPTION 'PB demo signature is missing. Run npm run seed:receipts again.';
  END IF;

  IF (
    SELECT count(*)
    FROM storage.objects
    WHERE bucket_id='transaction-evidence'
      AND name = ANY(ARRAY[
        v_base || '/receipts/RFP-REP-2026-900001.png',
        v_base || '/receipts/RFP-EXP-2026-900001.png',
        v_base || '/receipts/RFP-EXP-2026-900002.png',
        v_base || '/receipts/RFP-EXP-2026-900003.png',
        v_base || '/receipts/RFP-EXP-2026-900004.png',
        v_base || '/receipts/RFP-EXP-2026-900005.png'
      ])
  ) <> 6 THEN
    RAISE EXCEPTION 'One or more PB demo transaction receipts are missing. Run npm run seed:receipts again.';
  END IF;

  -- Remove the previous demo copy so this seed can be rerun cleanly.
  DELETE FROM public.cash_transactions
  WHERE actor_id=v_actor
    AND notes IN ('SAMPLE RFP SEED V7.3','SAMPLE RFP SEED V7.6');

  -- Demo seeding only: bypass normal application insert guards.
  ALTER TABLE public.cash_transactions DISABLE TRIGGER USER;

  INSERT INTO public.cash_transactions(
    id,account,kind,amount,category,description,actor_id,signature_path,proof_path,status,
    branch_id,transaction_date,payee,vat_type,cash_voucher_no,receipt_no,tin_no,notes,created_at
  ) VALUES
    ('RFP-REP-2026-900001','Funds','Additional Funds',100000.00,'Replenishment','Demo opening RFP replenishment',v_actor,v_signature,v_base||'/receipts/RFP-REP-2026-900001.png','Approved',v_branch,v_today-6,'Management',NULL,NULL,NULL,NULL,'SAMPLE RFP SEED V7.6',(v_today-6)::timestamptz + interval '08:00'),
    ('RFP-EXP-2026-900001','Funds','Expense',12000.00,'Supplies','Demo shop supplies expense',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900001.png','Approved',v_branch,v_today-5,'ABC Auto Supply','VAT','CV-DEMO-001','OR-DEMO-001',NULL,'SAMPLE RFP SEED V7.6',(v_today-5)::timestamptz + interval '09:00'),
    ('RFP-EXP-2026-900002','Funds','Expense',9500.00,'Transportation','Demo transport and delivery expense',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900002.png','Approved',v_branch,v_today-4,'FastTrack Logistics','Non-VAT','CV-DEMO-002','OR-DEMO-002',NULL,'SAMPLE RFP SEED V7.6',(v_today-4)::timestamptz + interval '10:00'),
    ('RFP-EXP-2026-900003','Funds','Expense',11000.00,'General','Demo general operating expense',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900003.png','Approved',v_branch,v_today-3,'General Merchant','VAT','CV-DEMO-003','OR-DEMO-003',NULL,'SAMPLE RFP SEED V7.6',(v_today-3)::timestamptz + interval '11:00'),
    ('RFP-EXP-2026-900004','Funds','Expense',7500.00,'Office Expense','Demo office expense',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900004.png','Approved',v_branch,v_today-2,'Office Depot Demo','VAT','CV-DEMO-004','OR-DEMO-004',NULL,'SAMPLE RFP SEED V7.6',(v_today-2)::timestamptz + interval '13:00'),
    ('RFP-EXP-2026-900005','Funds','Expense',10000.00,'Gasoline / Fuel','Demo fuel expense',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900005.png','Approved',v_branch,v_today-1,'Demo Fuel Station','VAT','CV-DEMO-005','OR-DEMO-005',NULL,'SAMPLE RFP SEED V7.6',(v_today-1)::timestamptz + interval '14:00');

  ALTER TABLE public.cash_transactions ENABLE TRIGGER USER;

  RAISE NOTICE 'RFP demo seed created for PB %, branch %. All proof paths are readable by that PB account. Expenses total PHP 50,000; current balance PHP 50,000.', v_actor, v_branch;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    ALTER TABLE public.cash_transactions ENABLE TRIGGER USER;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE;
END $$;
