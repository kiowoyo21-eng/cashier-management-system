# Seed RFP Receipts

Development/staging only. These are fake demo attachments for testing the PB RFP disbursement flow.

## Important

**Every seeded RFP transaction has a proof attachment.**

The SQL seed now checks the private `transaction-evidence` bucket first and **will fail instead of inserting the demo transactions** if any proof file is missing. This prevents a half-seeded dataset that cannot be used for disbursement PDF testing.

## Included transaction proofs

- `RFP-REP-2026-900001.png` — seeded PHP 100,000 replenishment proof
- `RFP-EXP-2026-900001.png` — PHP 12,000 expense receipt
- `RFP-EXP-2026-900002.png` — PHP 9,500 expense receipt
- `RFP-EXP-2026-900003.png` — PHP 11,000 expense receipt
- `RFP-EXP-2026-900004.png` — PHP 7,500 expense receipt
- `RFP-EXP-2026-900005.png` — PHP 10,000 expense receipt
- `demo-signature.png` — demo PB signature

The five expense receipts total **PHP 50,000**, so the PB dashboard disbursement threshold can be tested immediately.

All images are visibly marked **DEMO / FOR SYSTEM TESTING ONLY**.

## Setup order

1. Install dependencies: `npm install`
2. Set:
   - `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Upload all proof files:
   - `npm run seed:receipts`
4. In Supabase SQL Editor run:
   - `supabase/seed_001_rfp_pb_demo.sql`
5. Log in as PB and test **Prepare RFP Disbursement**.

Do not use this seed in production.
