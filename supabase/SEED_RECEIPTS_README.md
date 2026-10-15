# Seed RFP Receipts — V7.10

Development/staging only.

The demo dataset contains 12 expense transactions across all four physical branches plus one opening replenishment proof and one demo PB signature.

## Demo totals

- Mastermind Mandaluyong: PHP 12,500 (3 expenses)
- Underchargers Mandaluyong: PHP 12,500 (3 expenses)
- Underchargers Las Piñas: PHP 12,500 (3 expenses)
- Underchargers Quezon City: PHP 12,500 (3 expenses)
- Total expenses: PHP 50,000

## Update an existing demo database

1. Run `npm run seed:receipts` to upload/refresh the 12 receipt images.
2. Run `supabase/HOTFIX_022_update_existing_rfp_demo_transactions.sql` in Supabase SQL Editor.

The hotfix updates demo transactions 900001-900005 in place and adds 900006-900012. It does not delete the demo expense transactions.
