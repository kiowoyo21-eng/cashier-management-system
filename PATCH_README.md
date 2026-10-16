# CMS v14 PATCH ONLY

Apply these files over **v12 plus v13 patch**. Includes all v13 patch files unchanged except app/page.tsx, and adds components/RfpEditRequests.tsx.

1. Back up database. Run migration_024 if not already run, then migration_025_rfp_edit_requests.sql.
2. Copy patch paths to the project.
3. Deploy and validate: PB RFP click transaction > Request Edit; Sales no longer has edit request; BM Approvals queue.

Limitations: cross-branch RFP transfers require Admin/Super Admin approval; linked POS branch/plate cannot be changed through correction; historical legacy-ID records can still be rejected by cash_role_guard. Reconciliation of posted funds after approval is not automated here: verify before production use. Existing migrations 022/023 sales-request tables remain in DB but UI entry has been removed.
