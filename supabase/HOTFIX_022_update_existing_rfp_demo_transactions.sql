-- V7.10 DEMO DATA UPDATE ONLY.
-- Development/staging only. Do NOT run in production.
--
-- Purpose:
--   * Alters the existing RFP demo transactions instead of deleting/reseeding them.
--   * Keeps the existing demo IDs RFP-EXP-2026-900001..900005.
--   * Adds RFP-EXP-2026-900006..900012.
--   * Uses all four physical branches, 3 expenses per branch.
--   * Total demo expenses remain exactly PHP 50,000 (PHP 12,500 per branch).
--   * Resets any NON-RELEASED test disbursement request links that already contain
--     these demo expenses so the same demo rows can be tested again.
--
-- Run `npm run seed:receipts` from V7.10 BEFORE this SQL so all 12 receipt images exist.

DO $$
DECLARE
  v_actor uuid;
  v_profile_branch uuid;
  v_b1 uuid; v_b2 uuid; v_b3 uuid; v_b4 uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_base text;
  v_signature text;
  v_demo_ids text[] := ARRAY[
    'RFP-EXP-2026-900001','RFP-EXP-2026-900002','RFP-EXP-2026-900003',
    'RFP-EXP-2026-900004','RFP-EXP-2026-900005','RFP-EXP-2026-900006',
    'RFP-EXP-2026-900007','RFP-EXP-2026-900008','RFP-EXP-2026-900009',
    'RFP-EXP-2026-900010','RFP-EXP-2026-900011','RFP-EXP-2026-900012'
  ];
  v_request_ids text[];
BEGIN
  SELECT id,branch_id INTO v_actor,v_profile_branch
  FROM public.profiles
  WHERE role='PB' AND is_active=true
  ORDER BY created_at
  LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No active PB account was found.';
  END IF;

  SELECT id INTO v_b1 FROM public.branches WHERE name='Mastermind Mandaluyong' LIMIT 1;
  SELECT id INTO v_b2 FROM public.branches WHERE name='Underchargers Mandaluyong' LIMIT 1;
  SELECT id INTO v_b3 FROM public.branches WHERE name='Underchargers Las Piñas' LIMIT 1;
  SELECT id INTO v_b4 FROM public.branches WHERE name='Underchargers Quezon City' LIMIT 1;

  IF v_b1 IS NULL OR v_b2 IS NULL OR v_b3 IS NULL OR v_b4 IS NULL THEN
    RAISE EXCEPTION 'All four physical branches are required. Run migration_020_physical_rfp_branches.sql first.';
  END IF;

  v_base := v_actor::text || '/seed-rfp';
  v_signature := v_base || '/demo-signature.png';

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id='transaction-evidence' AND name=v_signature
  ) THEN
    RAISE EXCEPTION 'Demo PB signature is missing. Run npm run seed:receipts first.';
  END IF;

  IF (
    SELECT count(*)
    FROM storage.objects
    WHERE bucket_id='transaction-evidence'
      AND name = ANY(ARRAY[
        v_base||'/receipts/RFP-EXP-2026-900001.png',
        v_base||'/receipts/RFP-EXP-2026-900002.png',
        v_base||'/receipts/RFP-EXP-2026-900003.png',
        v_base||'/receipts/RFP-EXP-2026-900004.png',
        v_base||'/receipts/RFP-EXP-2026-900005.png',
        v_base||'/receipts/RFP-EXP-2026-900006.png',
        v_base||'/receipts/RFP-EXP-2026-900007.png',
        v_base||'/receipts/RFP-EXP-2026-900008.png',
        v_base||'/receipts/RFP-EXP-2026-900009.png',
        v_base||'/receipts/RFP-EXP-2026-900010.png',
        v_base||'/receipts/RFP-EXP-2026-900011.png',
        v_base||'/receipts/RFP-EXP-2026-900012.png'
      ])
  ) <> 12 THEN
    RAISE EXCEPTION 'One or more of the 12 demo RFP receipts are missing. Run npm run seed:receipts from V7.10 first.';
  END IF;

  -- If the old demo rows were already submitted in a TEST request, make them
  -- eligible again. Never rewrite demo expenses that belong to a Released request.
  IF EXISTS (
    SELECT 1
    FROM public.rfp_disbursement_request_items i
    JOIN public.rfp_disbursement_requests r ON r.id=i.request_id
    WHERE i.expense_id=ANY(v_demo_ids) AND r.status='Released'
  ) THEN
    RAISE EXCEPTION 'A demo expense is already part of a Released request. Do not rewrite released test history.';
  END IF;

  SELECT array_agg(DISTINCT i.request_id) INTO v_request_ids
  FROM public.rfp_disbursement_request_items i
  WHERE i.expense_id=ANY(v_demo_ids);

  IF coalesce(array_length(v_request_ids,1),0)>0 THEN
    DELETE FROM public.rfp_disbursement_request_items
    WHERE expense_id=ANY(v_demo_ids);

    DELETE FROM public.rfp_disbursement_requests
    WHERE id=ANY(v_request_ids)
      AND status<>'Released';
  END IF;

  ALTER TABLE public.cash_transactions DISABLE TRIGGER USER;

  -- Keep / repair the demo opening replenishment.
  INSERT INTO public.cash_transactions(
    id,account,kind,amount,category,description,actor_id,signature_path,proof_path,status,
    branch_id,transaction_date,payee,vat_type,cash_voucher_no,receipt_no,tin_no,notes,created_at,
    vehicle_unit,plate_number,quantity,unit_cost
  ) VALUES (
    'RFP-REP-2026-900001','Funds','Additional Funds',100000.00,'Replenishment','Demo opening RFP replenishment',
    v_actor,v_signature,v_base||'/receipts/RFP-REP-2026-900001.png','Approved',coalesce(v_profile_branch,v_b2),
    v_today-13,'Management',NULL,NULL,NULL,NULL,'SAMPLE RFP SEED V7.10',(v_today-13)::timestamptz+interval '08:00',
    NULL,NULL,1,100000.00
  )
  ON CONFLICT(id) DO UPDATE SET
    actor_id=EXCLUDED.actor_id,signature_path=EXCLUDED.signature_path,proof_path=EXCLUDED.proof_path,
    branch_id=EXCLUDED.branch_id,transaction_date=EXCLUDED.transaction_date,notes=EXCLUDED.notes,
    created_at=EXCLUDED.created_at,amount=EXCLUDED.amount,unit_cost=EXCLUDED.unit_cost,status='Approved';

  -- Existing 900001..900005 are ALTERED by this UPSERT; 900006..900012 are added.
  INSERT INTO public.cash_transactions(
    id,account,kind,amount,category,description,actor_id,signature_path,proof_path,status,
    branch_id,transaction_date,payee,vat_type,cash_voucher_no,receipt_no,tin_no,notes,created_at,
    vehicle_unit,plate_number,quantity,unit_cost
  ) VALUES
    ('RFP-EXP-2026-900001','Funds','Expense',4000.00,'Part','Front Brake Pads',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900001.png','Approved',v_b1,v_today-12,'Metro Brake Supply','VAT','CV-DEMO-001','OR-DEMO-001',NULL,'SAMPLE RFP SEED V7.10',(v_today-12)::timestamptz+interval '09:00','2018 Toyota Vios','ABC1234',2,2000.00),
    ('RFP-EXP-2026-900002','Funds','Expense',2500.00,'Part','Wiper Blade Set',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900002.png','Approved',v_b1,v_today-11,'ClearView Auto Parts','VAT','CV-DEMO-002','OR-DEMO-002',NULL,'SAMPLE RFP SEED V7.10',(v_today-11)::timestamptz+interval '10:00','2020 Mitsubishi Mirage','MIR2020',2,1250.00),
    ('RFP-EXP-2026-900003','Funds','Expense',6000.00,'Supply','ATF Fluid 1L',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900003.png','Approved',v_b1,v_today-10,'Prime Lubricants','VAT','CV-DEMO-003','OR-DEMO-003',NULL,'SAMPLE RFP SEED V7.10',(v_today-10)::timestamptz+interval '11:00','2019 Toyota Innova','INN2019',6,1000.00),

    ('RFP-EXP-2026-900004','Funds','Expense',4500.00,'Supply','Engine Oil 4L',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900004.png','Approved',v_b2,v_today-9,'Prime Lubricants','VAT','CV-DEMO-004','OR-DEMO-004',NULL,'SAMPLE RFP SEED V7.10',(v_today-9)::timestamptz+interval '09:30','2021 Nissan Navara','NAV2021',3,1500.00),
    ('RFP-EXP-2026-900005','Funds','Expense',3000.00,'Part','Oil Filter',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900005.png','Approved',v_b2,v_today-8,'FilterPro Trading','VAT','CV-DEMO-005','OR-DEMO-005',NULL,'SAMPLE RFP SEED V7.10',(v_today-8)::timestamptz+interval '10:30','2017 Honda City','HND2017',5,600.00),
    ('RFP-EXP-2026-900006','Funds','Expense',5000.00,'Supply','Coolant 1L',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900006.png','Approved',v_b2,v_today-7,'CoolDrive Parts','VAT','CV-DEMO-006','OR-DEMO-006',NULL,'SAMPLE RFP SEED V7.10',(v_today-7)::timestamptz+interval '13:00','2018 Hyundai Accent','ACC2018',5,1000.00),

    ('RFP-EXP-2026-900007','Funds','Expense',3600.00,'Part','Spark Plug',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900007.png','Approved',v_b3,v_today-6,'Ignition Hub','VAT','CV-DEMO-007','OR-DEMO-007',NULL,'SAMPLE RFP SEED V7.10',(v_today-6)::timestamptz+interval '09:15','2016 Toyota Wigo','WIG2016',4,900.00),
    ('RFP-EXP-2026-900008','Funds','Expense',2400.00,'Supply','Brake Cleaner',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900008.png','Approved',v_b3,v_today-5,'Workshop Supply Hub','VAT','CV-DEMO-008','OR-DEMO-008',NULL,'SAMPLE RFP SEED V7.10',(v_today-5)::timestamptz+interval '11:15','2019 Suzuki Ertiga','ERT2019',8,300.00),
    ('RFP-EXP-2026-900009','Funds','Expense',6500.00,'Part','Cabin Filter',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900009.png','Approved',v_b3,v_today-4,'FilterPro Trading','VAT','CV-DEMO-009','OR-DEMO-009',NULL,'SAMPLE RFP SEED V7.10',(v_today-4)::timestamptz+interval '14:00','2020 Toyota Fortuner','FOR2020',5,1300.00),

    ('RFP-EXP-2026-900010','Funds','Expense',2500.00,'Part','Battery Terminal Set',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900010.png','Approved',v_b4,v_today-3,'Electrical Auto Supply','VAT','CV-DEMO-010','OR-DEMO-010',NULL,'SAMPLE RFP SEED V7.10',(v_today-3)::timestamptz+interval '09:45','2018 Isuzu Crosswind','ISZ2018',5,500.00),
    ('RFP-EXP-2026-900011','Funds','Expense',4000.00,'Supply','Shop Consumables',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900011.png','Approved',v_b4,v_today-2,'Workshop Supply Hub','VAT','CV-DEMO-011','OR-DEMO-011',NULL,'SAMPLE RFP SEED V7.10',(v_today-2)::timestamptz+interval '12:30','SHOP','NA',10,400.00),
    ('RFP-EXP-2026-900012','Funds','Expense',6000.00,'Part','Air Filter Set',v_actor,v_signature,v_base||'/receipts/RFP-EXP-2026-900012.png','Approved',v_b4,v_today-1,'FilterPro Trading','VAT','CV-DEMO-012','OR-DEMO-012',NULL,'SAMPLE RFP SEED V7.10',(v_today-1)::timestamptz+interval '15:00','2022 Toyota Hilux','HLX2022',6,1000.00)
  ON CONFLICT(id) DO UPDATE SET
    account=EXCLUDED.account,kind=EXCLUDED.kind,amount=EXCLUDED.amount,category=EXCLUDED.category,
    description=EXCLUDED.description,actor_id=EXCLUDED.actor_id,signature_path=EXCLUDED.signature_path,
    proof_path=EXCLUDED.proof_path,status=EXCLUDED.status,branch_id=EXCLUDED.branch_id,
    transaction_date=EXCLUDED.transaction_date,payee=EXCLUDED.payee,vat_type=EXCLUDED.vat_type,
    cash_voucher_no=EXCLUDED.cash_voucher_no,receipt_no=EXCLUDED.receipt_no,notes=EXCLUDED.notes,
    created_at=EXCLUDED.created_at,vehicle_unit=EXCLUDED.vehicle_unit,plate_number=EXCLUDED.plate_number,
    quantity=EXCLUDED.quantity,unit_cost=EXCLUDED.unit_cost;

  ALTER TABLE public.cash_transactions ENABLE TRIGGER USER;

  RAISE NOTICE 'Demo RFP data updated in place: 12 expenses, PHP 50,000 total, PHP 12,500 per physical branch.';
EXCEPTION WHEN OTHERS THEN
  BEGIN
    ALTER TABLE public.cash_transactions ENABLE TRIGGER USER;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE;
END $$;
