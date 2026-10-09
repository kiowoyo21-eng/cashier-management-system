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
