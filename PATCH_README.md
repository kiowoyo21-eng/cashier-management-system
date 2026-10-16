# CMS v13 — incremental patch only

Based on **CMS v12 Sales Request Popup**. This ZIP is **not a complete application**.

## Changed files
- `app/page.tsx` — RFP Parts-only entry, automatic category, linked POS selection/status, retains PB-only `Request Edit` popup from v12.
- `components/RfpPartPosLink.tsx` — PB chooses one matching **Pending** POS when automatic linking is unavailable; displays linked POS ID.
- `components/RfpDisbursement.tsx` — Parts-only report descriptions; v12 30-transactions-per-page layout preserved.
- `lib/backend.ts` — loads secure POS pin records, adds **approved** RFP part costs to POS COGS read model, avoids simple identical manual line-item duplicates.
- `lib/store.ts` — adds linked POS ID to cash entry read model.
- `supabase/migration_024_rfp_parts_pos_link.sql` — Parts-only insert guard, permanent one-POS-per-RFP-part unique constraint, automatic unique Pending POS matching and PB-only manual selection, audit, RLS.

## Installation
1. Make a backup. Use only on a staging/test database until validated.
2. Confirm DB migrations 022 and 023 succeeded earlier.
3. In Supabase SQL Editor, run **only** `supabase/migration_024_rfp_parts_pos_link.sql` (one time).
4. Copy changed files **into corresponding paths of v12 source**; do not delete other project files.
5. Commit/push GitHub and redeploy Vercel.

## Safety/limitations
- Auto pin happens only if exactly one **Pending** POS has the same normalized plate number **and** branch. If multiple POS match, PB selects one. Closed POS must use an approved correction/extension, not be silently changed.
- A single parts expense can never be pinned twice. Multiple distinct parts can be pinned to one POS.
- Linked **approved** RFP part costs are included in application COGS readings, not physically written to `pos_accounts.costs`. Any external SQL report querying `pos_accounts.costs` directly will not include linked RFP parts; modify reports separately if needed.
- Identical manual COGS line items are filtered by name + quantity + unit cost for app calculations, but ambiguous/manual duplicates must be reconciled by accounting.
- Existing old Supply transactions remain historically intact; only new RFP expense inserts are restricted.
- Full Next.js build and live Supabase workflow have **not** been verified here. Run on staging first.
