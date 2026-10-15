# V7.6 Seed Storage RLS Fix

- Fixed demo receipt/signature uploads so they live under the PB user's UUID folder.
- This matches the existing private Storage RLS policy and allows signed URLs to load in the PB browser.
- Updated SQL seed to use the same dynamic PB-owned paths.
- No new database migration is required.
- Rerun `npm run seed:receipts`, then rerun the demo SQL seed.
