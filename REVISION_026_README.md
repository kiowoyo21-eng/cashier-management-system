# Cashier Management System — Review Revisions 001–005

**Prepared for testing.** This is an updated **code ZIP**, not a change to your live Vercel site or Supabase database. Back up your database before applying the migration.

## What changed

| Review | Implemented change | Location |
|---|---|---|
| #001 | Adds missing favicon; updates private Supabase Storage read permissions for PB-accessible RFP receipts/evidence | `app/favicon.ico`, migration 026 |
| #002 | Creates the missing `public.rfp_edit_requests` table (even if migration 025 was skipped), corrects authorized branch names, and installs PB request/BM-admin review RPCs with audit logs and concurrency checks | migration 026, `components/RfpEditRequests.tsx` |
| #003 | Both RFP action buttons yellow, `+` icon only on **Record RFP Expense** | `app/page.tsx` |
| #004 | Admin and Super Admin can directly edit existing Revolving Fund/RFP and POS/Sales financial transactions, without a Submit Report; required reason; atomic edits with full old/new audit snapshots, actor and timestamp. Audit Logs screen now available to Admin | `components/AdminTransactionEditor.tsx`, `app/page.tsx`, migration 026 |
| #005 | Only `Part` is accepted for new RFP expenses, edit requests, new disbursement items and category creation. Existing historical non-Part entries remain in history for traceability | migration 026 and RFP forms |

## Steps to apply

1. **Back up your Supabase database first.** Use a *test project* if possible.
2. Confirm the prior migrations up through **`migration_024_rfp_parts_pos_link.sql`** have been applied. `migration_026_review_fixes.sql` includes the setup formerly done by `migration_025_rfp_edit_requests.sql`; **do not run migration 025 afterwards**, because that would overwrite the corrected RPC functions. If 025 was already applied, 026 upgrades it.
3. Open the Supabase **SQL Editor** of the **same project used by Vercel**, paste `supabase/migration_026_review_fixes.sql`, and run it. Check for success. The migration includes `NOTIFY pgrst, 'reload schema'` to refresh the PostgREST cache. If the table still is not found immediately, wait briefly and reload the website.
4. Push/copy the updated app code to your GitHub repository and deploy to Vercel. Keep existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` settings for the intended test project. The supplied archive intentionally contains no credentials.
5. Sign out/in, hard refresh, then run the test checklist below.

## Test checklist

- [ ] No `favicon.ico` 404 in DevTools.
- [ ] PB opens a **Part** expense > **Request Edit**; original data and four physical branches appear.
- [ ] PB submits a correction, BM sees it in **Approvals**, approves/rejects, and audit log records old/new values.
- [ ] PB and Admin cannot submit an RFP Expense with a category other than **Part**, including through SQL RPCs.
- [ ] Legacy non-Part RFP expenses remain visible as history, but cannot be used in a *new* disbursement request.
- [ ] RFP buttons are both yellow; `Record RFP Expense` alone has the plus symbol.
- [ ] Admin opens Revolving Fund / RFP transaction > **Admin Edit Transaction**; edits details/amount; adds a required reason; checks updated balance and audit log.
- [ ] Admin opens POS and Sales records > **Admin Edit**; corrects items/payments (closed POS must remain fully paid); checks sales totals and audit log.
- [ ] Admin sees **Audit Logs**, and non-Admin cannot call the edit RPC even using a direct network request.
- [ ] Changes to linked RFP branch/plate or already-covered disbursement amount are blocked rather than silently desynchronizing accounting or PDFs.
- [ ] Confirm all historical signed receipt images render for PB. If browser still reports `400`, inspect failing request in Network, including URL path and response body, and verify the referenced Storage file exists.

## Important accounting protections

**No Submit Report workflow** was added, as requested for testing. Every edit still requires a reason and writes to `audit_logs`, including actor UUID and database timestamp. Direct edits cannot change transaction IDs, ownership, account type, workflow status, branch assignment for POS, e-signatures or proof attachment paths.

**Locked monetary references:** An RFP expense **already included in a disbursement request** cannot have its amount changed; an RFP replenishment **released from an approved request** cannot have its amount changed. These monetary corrections need a separate adjustment/reversal/reissued-report workflow to avoid conflicting with already-generated signed PDFs or approved request totals. Metadata can still be edited. This is an intentional safety limit, not a missing UI button.

Changing POS amounts immediately recalculates the displayed sales total from `items`; edited POS payments remain in the same record. A *Closed* POS must remain fully paid. Frontend balance and report views reload after a successful save.

## About the 400 error from screenshot #001

The screenshot shows a **truncated Supabase-related failed resource**. It does not identify the precise endpoint. Migration 026 improves PB permissions for reading evidence owned by other staff, a potential source of missing resources, but **the screenshot alone cannot prove this is the cause**. If a 400 persists, check Chrome DevTools **Network → failed request → Headers + Response**; it may reflect a missing Storage object, invalid signed URL, an expired token or a different API error. No live deployment or online API verification was performed with this ZIP.

## Verification performed on these local files

- Parsed **36 TS/TSX files**, **0 syntax errors** with the TypeScript parser.
- Verified required file paths and that migration 026 contains its own table creation, policy updates, RPC definitions, PostgREST schema refresh and Parts-only trigger.
- **Not verified:** TypeScript *typechecking* / Next production build (dependencies could not be installed in this environment), SQL execution against your Supabase schema, or end-to-end Vercel testing. Perform the tests above after deployment.
