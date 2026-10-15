# Seed RFP Receipts (V7.9)

Development/staging only.

## Why the seed path changed

The `transaction-evidence` bucket is private. Its normal read policy allows a PB user to create signed URLs for objects whose first folder is that PB user's UUID. Older demo files were uploaded under `seed/...`, so the SQL could see them through the service role but the PB browser could not read them.

V7.6 fixes that by uploading to:

`<PB_USER_UUID>/seed-rfp/...`

## Run order

1. Ensure one active PB account has an assigned branch.
2. Set `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` in your terminal.
3. Run `npm run seed:receipts`.
4. Run `supabase/seed_001_rfp_pb_demo.sql` in Supabase SQL Editor.
5. Refresh/login again as that same PB account.
6. Open **Prepare RFP Disbursement**. All five expense receipts should show **Attached**.
7. Generate the **Disbursement Report PDF** and the separate **Receipts PDF**.

Do not use this demo seed in production.


## V7.9
The demo SQL seeds only Part/Supply RFP expenses and intentionally distributes them across all four physical branches:

- Mastermind Mandaluyong
- Underchargers Mandaluyong
- Underchargers Las Piñas
- Underchargers Quezon City

The five sample expense rows still total PHP 50,000 so the disbursement threshold alert can be tested. The formal report is generated as a one-page summary; receipt images are generated into a separate PDF.
