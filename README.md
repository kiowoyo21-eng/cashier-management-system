# Cashier Management System — Supabase Integration

Generic cashier app, Next.js 15 / React 19, Supabase Auth / PostgreSQL / Storage, Vercel.

## 1. Create Supabase project

1. In Supabase Dashboard create a project.
2. Go to **SQL Editor**, paste/run `supabase/schema.sql` ONCE on a **new** project. This creates profiles, cash transactions, POS accounts, audit logs, private image storage, triggers, RPC operations, and Row Level Security.
3. In **Authentication > Users** create the cashier and admin users. Password authentication requires confirmed email; create users via the dashboard or enable email confirmation.
4. In **SQL Editor** promote the correct user account (replace email):

```sql
update public.profiles set role='Super Admin'
where id=(select id from auth.users where email='you@example.com');
```

To grant another user Admin use the same query with `role='Admin'`.

Do not give cashiers SQL access or change roles through UI. Never publish the Supabase service-role key.

## 2. Connect Vercel

Upload extracted project **contents** to a GitHub repository root. Import the repo at Vercel with Framework `Next.js` and root `./`.

In Vercel > Project > Settings > Environment Variables add:

- `NEXT_PUBLIC_SUPABASE_URL` — Project URL from Supabase > Connect / API settings.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon or publishable key from Supabase.

Deploy/redeploy. Create users first, then sign in on the web app. Only these two public environment variables are used.

## 3. What is working in this integration

- Email/password Supabase Auth login, display name and role taken from `profiles`, sign out.
- Persistent POS transactions, pending until **Close Account**; Sales displays **only Closed** POS automatically; no manual Add Sale.
- Persistent Petty Cash/Funds and immediately adjusted ledger balances including Pending and Submit Explanation.
- Additional Funds: signature + camera capture required **before posting**. Camera on device showing form. Images go into a private storage bucket.
- Expense: signature before posting, optional receipt afterward; admin cannot approve without proof.
- Admin can approve or request explanation, cashier creator can respond; server-enforced role/state checks.
- Server-generated timestamps, automatic account-bound audit history, no client write to tables.

## 4. IMPORTANT: work still needed before production use

This is a backend-connected **development build**, NOT audited production accounting software.

- Expense camera capture currently uses the browser's `capture` file input and can allow choosing gallery on some devices. Add server-mediated one-time phone camera sessions and QR capture before enforcing "camera-only" across devices.
- POS additional payments are now available for Pending accounts through an RPC and are recorded in the audit trail. POS payment receipt capture, itemized COGS receipt capture, and editing pending POS items are NOT implemented; current UI still has demo labels. Do not use for real-money POS reconciliation yet.
- Actual user access is currently single-organization/global for POS and cash transactions; add branch assignments and branch-specific RLS if branches need isolation.
- Only transaction creation and review are protected by RPC; add idempotency keys, reconciliation and financial corrections with reversal entries before production.
- Account balance derives from signed cash ledger entries, including pending amounts. Approvals do not double-post.
- The UI account name is generic. No organization-specific branding.
- Supabase project and Vercel GitHub integrations must be configured by the user; no deployment is done by the ZIP itself.

## Troubleshooting

If sign-in works but loading data fails, ensure SQL completed, user has a profile, and permissions/RLS are installed. If a photo fails, verify Storage bucket and camera permissions (HTTPS). If you just added Vercel environment variables, trigger a fresh deployment.

## Phase 2 upgrade (existing Supabase project)

If you already applied `supabase/schema.sql` from the previous download, run ONLY `supabase/migration_002_pos_payments.sql` in the Supabase SQL Editor.

If you are creating a brand-new Supabase project, run `supabase/schema.sql` only; it already contains the Phase 2 additional-POS-payment function. Do not rerun the entire base schema against an existing database.

After updating the GitHub repository and running the migration, Vercel redeploys the Next.js application. Test Pending POS > Add Payment > Close Account > Sales details using non-real-money test transactions.

**Build verification:** Dependencies could not be downloaded within the build environment, so `next build` was not successfully run here. Vercel must confirm the build. Do not use for live cash handling without completing the remaining controls and end-to-end tests.

## Phase 3: Super Admin User Management + Discrepancy

1. On the same Supabase project where `schema.sql` and `migration_002_pos_payments.sql` were applied, open SQL Editor. Run **`supabase/migration_003_admin_reconciliation.sql` exactly once**. It adds `profiles.is_active`, cash reconciliation history and admin-only RPC, plus inactive-account checks on existing finance RPCs.
2. In Vercel → Project → Settings → Environment Variables, set **`SUPABASE_SERVICE_ROLE_KEY`** to the service-role key from Supabase API settings. **SERVER ONLY**: never add `NEXT_PUBLIC_` to this key or paste it into frontend code. Keep existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Configure Supabase Authentication → URL Configuration → Site URL to your deployed Vercel URL, and add your Vercel origin to the allowed Redirect URLs for invitations. Configure a functional SMTP provider if invitation emails fail to send.
4. Upload the updated repository files to GitHub and redeploy Vercel. Sign in with an existing `Super Admin` user, then open **User Management** and invite Cashier/Admin employees. Invitees set their own passwords through the email link.
5. Test deactivating an employee, log out / in, and verify the employee cannot access financial RPC actions; confirm Supabase audit records are created.
6. Open **Discrepancy**, select Petty Cash or Funds, enter actual counted cash and submit. `Expected` includes every saved ledger movement, including pending entries, and the difference is stored with the Super Admin ID and time. This does NOT yet reconcile a POS till.

**IMPORTANT:** Do not use for live funds yet. Receipt capture via phone link, POS receipt enforcement, comprehensive testing, multi-branch authorization and production-grade reconciliation still need further work. `npm install` was blocked in the development environment by DNS (`EAI_AGAIN`), therefore Next.js build has not been verified. Check the first Vercel build logs.

## Phase 4: Invitation and password recovery (no SQL migration)

1. Deploy the updated GitHub source to Vercel. Existing Supabase tables stay unchanged.
2. In Vercel environment variables, set `NEXT_PUBLIC_SITE_URL` to **your real HTTPS production CMS URL**, e.g. `https://your-cms.vercel.app` (no trailing path). Keep all previous Supabase env variables.
3. In Supabase → Authentication → URL Configuration, set **Site URL** to your production CMS origin and add `https://your-cms.vercel.app/auth/callback` to **Redirect URLs**. For multiple deployment domains add each trusted origin explicitly.
4. Send a *new* invitation from Super Admin → User Management. Old emails containing `localhost` cannot be repaired.
5. The invitation verifies in `/auth/callback`, then redirects to `/auth/set-password` where employee sets a 12+ character password. Login → **Forgot password?** sends a recovery email through the same callback.
6. Supabase may impose default email sending limits; configure appropriate SMTP for reliable employee invitations.

Security: account invitations are generated by the server-only Admin API, and password updates use the invited user's Supabase session. No user-entered role changes and no credentials are embedded in the client.


## One-time phone camera proof (migration 004)
1. In Supabase SQL Editor run `supabase/migration_004_phone_camera.sql` once.
2. On Vercel set `NEXT_PUBLIC_SITE_URL` to your deployed HTTPS URL, and keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.
3. Redeploy with the updated code. The laptop generates a QR link; the phone browser opens `/capture/<one-time-token>` and uses its rear camera. Photos are uploaded directly to private Supabase Storage through a server route.
4. Additional Funds: after signature generate QR and capture photo *before* recording transaction. Expenses: signed transaction adjusts balance immediately; open it and use Generate Phone Receipt Link to attach proof while pending.
5. A link accepts only one image and expires in 10 minutes. Use a fresh QR if expired. Browser camera access requires HTTPS and permission.
6. This implements phone-camera evidence for Petty Cash/Funds; POS receipts and COGS camera workflows remain to be integrated before production financial use.

**Security**: Only an authenticated active account can create/poll QR sessions. One-time tokens are random and stored as hashes; the phone must have the token to upload. Keep the QR private.

## October 2026 phase: Daily Controls & BM review (migration 005)

This release adds draft working UI routes in the single-page CMS navigation for **BOD / EOD**, **BM Inbox**, **Friday Turnover**, and updated **Reports**. Super Admin can invite **Branch Manager** users and assign branches. On an existing Supabase instance, run `supabase/migration_005_daily_controls.sql` ONCE, after migrations 001–004. Do **not** rerun `schema.sql` on an existing database.

### REQUIRED branch initialization before accepting any transaction

Migration 005 intentionally does not auto-assign historical transactions to a branch. Create real branches using Supabase SQL Editor with a trusted administrator, substituting your approved names and (when known) opening petty cash limits:

```sql
INSERT INTO public.branches (name, petty_cash_limit)
VALUES ('Main Branch', NULL)
ON CONFLICT (name) DO NOTHING;

-- Verify account ownership first; replace the UUID with your actual Super Admin auth.users UID.
UPDATE public.profiles
SET branch_id = (SELECT id FROM public.branches WHERE name='Main Branch')
WHERE id = 'REPLACE-WITH-REAL-SUPER-ADMIN-UUID';
```

Historical rows with `branch_id IS NULL` will be hidden from ordinary branch staff after the migration. An administrator must **verify the originating branch** then migrate those rows individually; never bulk reassign unknown historical cash records by guessing a branch. New transactions require an assigned branch.

### Operational limitations / pre-production blockers

- `npm run build` is NOT verified in this workspace because npm registry access was unavailable. Verify build using Vercel logs.
- Before real financial use, review branch isolation of existing `SECURITY DEFINER` RPCs (`review_cash`, `close_pos`, `add_pos_payment`, and other older procedures). Their legacy policies/functions predate branch scoping; a sidebar restriction is not a sufficient security boundary. Run multi-account, cross-branch penetration tests.
- BOD/EOD expected balance, weekly turnover and accounting rules require an approved finance reconciliation review; old POS payments stored in JSON need to be migrated into an immutable payment ledger to prevent double-posting and support reliable receipts.
- Friday turnover in this phase records the release signature and QR image but still needs a separate **receiver signature** screen before production approval.
- Formal liquidation submission workflow, scheduled Sunday exports/notifications, operational BOD gate on all transaction endpoints, and periodic EOD locks are not yet finished. Reports now show daily and Sunday-ending weekly groupings, but not automatic emailed/exported reports.
- `branch_discrepancies` review actions must be fully wired to cashier re-explanation and BM escalation alerts. Current BM inbox shows and records review decisions; no email/push alerts.
- Avoid using this version for actual cash custody until these checks and role policies are complete.


## Daily task + test reset update (migration 006)

1. Apply migrations 001-005 first, then execute `supabase/migration_006_tasks_reset.sql` ONCE in SQL Editor. Back up existing data before migrations.
2. BOD and EOD tasks appear on Dashboard for each cash account. EOD unlocks at 16:00 Philippine Time, enforced by server-side SQL. BOD is required before signed Petty Cash / Funds movements. Mismatches are sent to Branch Manager and lock movements until acknowledged or resolved.
3. Friday Funds Turnover lives inside Funds, with full-turnover default; a server-side Friday restriction remains. BM discrepancies appear in BM Inbox. Reports remain accessible under Reports.
4. Settings > Reset Test Data is Super Admin-only. It is disabled by default. For a **separate staging Vercel environment**, set `ENABLE_TEST_RESET=true`; for production-mode Vercel deploys it additionally requires `ALLOW_PRODUCTION_TEST_RESET=true`, which is **not recommended**. Password reauthentication and typed `RESET TEST DATA` are mandatory.
5. **Reset caveat:** the implemented reset clears database transaction records, but does **not** delete Supabase Storage objects (receipt/signature images). DO NOT describe this as a complete storage wipe. Accounts, branches and database schema are preserved. A reset event remains in audit logs.
6. EOD/turnover discrepancies, formal receiver signatures, robust weekly report delivery, and POS cash-drawer logic require additional live integration tests before production use.
7. Build validation: run `npm install && npm run build` with network access; also test app login and migrations in staging before replacing a live deployment.

## v7 — Cash Transaction Confirmation and Approved Corrections

1. Upload the contents of this ZIP to the existing GitHub repository (do **not** overwrite existing Supabase data).
2. In **Supabase SQL Editor**, run only `supabase/migration_007_corrections.sql` **after** migrations 001–006.
3. Deploy on Vercel. No new environment variables are required.
4. Test with **separate** Cashier and Admin/Super Admin accounts: submit signed Petty Cash transaction, request corrected amount/purpose, review approval, sign corrected amount, and verify only one net change to balance with an audit record. Repeat with a **Pending** POS quotation. Approval expires after 30 minutes. Requester cannot approve their own request.
5. `Closed` POS accounts do not support direct quotation re-edit; a separate sales adjustment / refund workflow is required.

The corrected amount, purpose, and account are visible in the correction interface. New Petty Cash/Funds transactions display amount as a number and in words on both the confirmation and signature screens with no projected balance displayed. POS payment entry prompts for confirmation. Admin dashboards no longer render the Cashier BOD/EOD task panel.

**Not production-ready:** `npm run build` cannot be verified in the current packaging environment because registry.npmjs.org is unreachable. POS payment proof enforcement, full cross-branch authorization review, and closed-sale financial adjustment workflows remain to be completed/tested before real-money use. The review form for POS quotation changes uses an editable JSON item list in this build; replace it with an item-by-item form in a later UX polish pass.

## v8 — Cashier Tasks, IR, guards and notification update (October 2026)

**Deployment order:** preserve your current Supabase database and users. On an installation already migrated through `migration_007_corrections.sql`, run **only** `supabase/migration_008_cashier_tasks_ir.sql` in the SQL Editor. Then upload the contents of this folder to the root of your existing GitHub repository and verify Vercel's deployment. Do **not** re-run `schema.sql` or reset production records.

Changes in this update:
- Dashboard **Cashier Tasks** panel with compact Petty Cash, Funds, Sales columns; only Cashier role sees action tasks.
- Petty Cash and Funds BOD verification with 9:30 AM deadline, late IR, previous-day missed EOD IR, and automatic BOD mismatch IR to BM queue. A submitted IR does **not** require BM approval before continued access once BOD is recorded.
- Daily EOD unlock at 4 PM; 6 PM overdue indicator. Next-day IR for missed EOD; per-account cash posting guard, including POS cash payments.
- Friday Funds Turnover entry remains in Funds, with a Friday Dashboard task linking there. Weekly Sales review is due Friday 11:59 PM and has a confirmation/submission record; **sales entries are only produced by closed POS**.
- BM Inbox loads missed EOD, late BOD and BOD discrepancy incidents. Branch-scoped BM; Admin and Super Admin read all branches.
- Authenticated Cashier header shows the physical assigned branch; Admin/Super Admin show ALL BRANCHES.
- In-app toast notification provider, header notification bell with periodic checks, pending action indicators and button loading states for the new flows.
- Existing v7 amount-in-words confirmation, signed cash records, Request Correction approval, account-based audit, one-time phone camera QR and read-only Sales are retained.

**Security and operations:** The Incident Report is a *report*, never an automatic financial adjustment. No real-data reset is performed by this migration. Backend checks control cash posting and BOD eligibility. Signatures/proof require authentication and a private Supabase Storage bucket. Notification bell is refreshed by polling, not real-time push.

**Known development limitations:** Full Next.js production build and live Supabase migration tests were not possible in the authoring environment because npm registry access was unavailable. In particular, test the migration on a staging Supabase copy first and verify multi-day EOD workflows, role-specific access, real cash payments in POS, existing correction flows, signing and QR proofs. Prior missed-EOD dates are checked from recent stored daily counts; extended closures, holidays, shift handovers, final receiver-signature enforcement, full POS payment receipt controls and financial reporting are not yet production-certified. Keep this as a development/test build.

**v8 final amendments:** Friday turnover submission is limited to Cashiers on Friday after 4:00 PM Philippine Time. Any older BOD with no matching EOD is flagged for a missed-EOD IR, and BM can request a follow-up explanation. The current notification bell polls for open items every minute; it is not push delivery.

## v9 — POS detail interactions and COGS

Run `supabase/migration_009_pos_items.sql` **after migration 008**, on a staging database first. It adds itemized COGS and an auditable `pos_additional_transactions` table, plus restricted RPC functions. It does not wipe existing financial data.

### Interface
- POS, Sales, cash ledger and cash approvals rows open transaction details when clicked (keyboard Enter/Space on accessible rows). Action buttons inside rows do not accidentally open the row modal.
- POS has compact quotation and COGS itemized entry. Additional transactions can be appended only to Pending POS through the POS detail popup, with their own quotation lines and COGS lines. The original POS entries remain recorded; audit logs record appended values.
- No standalone Additional Services step during initial POS creation; Sales remains read-only.
- Friday weekly Sales submission is locked before Friday. A missed prior-Friday task remains available for overdue filing.

### Current development limitations
- POS receipt photo enforcement, per-supplier COGS proof, and dedicated signature acknowledgment for appended POS items are **not** complete. Do not use this release for live financial custody without those controls.
- `createPos` is followed by a second RPC to save itemized COGS. If the second RPC fails, the Pending POS may already exist, so check its record rather than resubmitting blindly. A single atomic RPC should replace this before production.
- The migration's additional-POS access check currently allows the originating staff account and Admin/Super Admin; branch-specific enforcement of Admin access still needs end-to-end review.
- Full `next build` has not been verified in this runtime; run it in Vercel and review deployment logs before use.

## Workflow revision — migration 010 (current release)

This source revision keeps the legacy database values `BOD`, `EOD`, `Additional Funds`, and the existing `fund_turnovers` table for backward compatibility, but the operational UI now uses clear terminology such as **Opening Cash Count**, **Closing Cash Count**, **Replenishment**, **Expense**, and **Friday Fund Handover**.

For an existing installation already migrated through `migration_009_pos_items.sql`:

1. Back up the Supabase database and test on staging first.
2. Run **`supabase/migration_010_workflow_revision.sql` once** in the Supabase SQL Editor.
3. Deploy this updated source to Vercel/GitHub.
4. Verify role access, cash-count tasks, Friday Fund Handover, POS creation/filtering, supplier access, and vehicle master data before production use.

### Included in this revision

- Friday Fund Handover is a scheduled **popup/modal task** instead of a permanent Funds-page form. A local Save Draft option is available before submission.
- Fund activity uses two clear actions: **Replenish Fund** and **Record Expense**. Sales cash remains generated from POS and is not treated as a manual fund replenishment.
- Fund activity is compiled into **Handover Periods**. Each historical period can be viewed and exported to CSV; the latest period remains Open until the next handover.
- Petty Cash has automatic **Monthly Reports** plus **Custom Date Range** reports, with View Details and CSV export.
- POS/Sales/Fund activity tables are chronological by the appropriate business timestamp and use pagination where appropriate. Closed Sales are ordered by `closed_at`, newest first.
- POS includes optional independent autocomplete filters for **Year Model**, **Car Brand**, and **Car Model / Unit**, plus general customer/plate/reference search.
- Missing vehicle values can be added from autocomplete. Migration 010 normalizes values so case/extra spaces do not create duplicate brands/years/models; models are unique within a brand.
- Authorized management roles have a **Vehicle Master Data** screen for Brands, Models/Units, and Years, including rename/edit and deactivate/activate actions.
- A branch-scoped **Suppliers** directory is included for parts/COGS/restocking coordination.
- Recent cash-count records and review queues use pagination to avoid long unbounded tables.

### Database compatibility note

Do not rename legacy database codes or tables manually. `BOD`/`EOD` and `fund_turnovers` remain internal identifiers used by earlier migrations and RPCs. Migration 010 changes the user-facing terminology while preserving existing records and compatibility.
