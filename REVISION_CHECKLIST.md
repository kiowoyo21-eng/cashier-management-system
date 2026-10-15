# Cashier Management System — Master Revision Checklist

This checklist reflects the October 2026 revision batch agreed during workflow review.

## Included in this build

### Roles and terminology
- [x] Cashier operational scope is **Sales + Revolving Fund**.
- [x] PB operational scope is **RFP**.
- [x] RFP is removed from Cashier navigation and server-side access is hardened in migration 013.
- [x] User-facing `Petty Cash` terminology is replaced by **Revolving Fund**.
- [x] User-facing `Funds` terminology is replaced by **RFP**.
- [x] User-facing BOD/EOD labels are **Opening Cash Count / Closing Cash Count**.
- [x] **Sales** uses the operational term **Sales Turnover**; RFP retains **Handover** for the PB workflow.

### Cashier daily tasks
- [x] Opening Cash Count task gating for Sales and Revolving Fund.
- [x] 4:50 PM warning checks the two final closing responsibilities: **Revolving Fund Closing Cash Count** and **Sales Turnover**.
- [x] At 5:00 PM, protected Cashier operations gate to the incomplete closing responsibility.
- [x] Two required closing tasks only: **Revolving Fund Closing Cash Count** and **Sales Turnover**.
- [x] Standalone **Sales Closing Cash Count** is removed from the Cashier workflow.
- [x] Separate **Close Cashier Shift** action is removed; both closing tasks completing means the day is complete.
- [x] Sales Turnover has its own sequential `SALES-HO-YYYY-######` number.
- [x] Sales Turnover history is available from Sales Tracking with pagination and CSV export.

### Revolving Fund
- [x] Two primary actions: **Replenish Revolving Fund** and **Record Revolving Fund Expense**.
- [x] Expense captures Transaction Date, Supplier/Payee, Category, Amount, VAT/Non-VAT, CV No., Receipt No., TIN No., Description and Notes.
- [x] Revolving Fund transaction numbers: `RF-EXP-*` and `RF-REP-*`.
- [x] Expense categories are searchable, reusable, normalized and duplicate-protected by the database.
- [x] Existing saved categories are loaded into category suggestions.
- [x] Replenishment popup shows Last Replenishment, Authorized Revolving Fund (branch setting), Cash on Hand, Expenses Since Last Request, CV Series Covered and Total Amount Requested.
- [x] Replenishment amount uses the configured authorized branch fund target when available; otherwise it falls back to expenses since the previous replenishment.
- [x] Revolving Fund Reports are button → modal only.
- [x] Monthly reports are compiled automatically.
- [x] Custom date-range reporting is available.
- [x] Revolving Fund Dashboard summary includes Cash on Hand, Replenishments, Expenses, Amount for Replenishment, Last Replenishment, Top Expense Category, category totals and recent activity.

### RFP / PB workflow
- [x] RFP is PB/authorized-management only.
- [x] RFP expense / replenishment numbering: `RFP-EXP-*` / `RFP-REP-*`.
- [x] Friday RFP Handover is popup/modal only.
- [x] RFP Handover numbering: `RFP-HO-*`.
- [x] RFP Handover periods are compiled automatically and are button → modal only.
- [x] RFP period history has pagination and CSV export.
- [x] RFP expected balance is based on RFP activity only and no longer mixes Sales cash.

### POS / quotation / vehicle
- [x] POS transaction numbering: `POS-YYYY-######`.
- [x] Quotation item Type is required: **Service** or **Part**.
- [x] Quotation Qty / Unit Price inputs are compact, numeric and protected from accidental mouse-wheel changes.
- [x] COGS Qty / Unit Cost inputs use the same compact numeric treatment.
- [x] POS captures Customer TIN, Address, Mileage, Platform/Booking Source, S.A, Booked By, Mechanic, BS/SI and Remarks. Checklist has been removed from the current workflow.
- [x] POS vehicle filters are compact within the search/filter area rather than a separate oversized section.
- [x] Year / Brand / Model are searchable autocomplete inputs and may be used independently.
- [x] Missing vehicle master values can be added with normalized duplicate checking.
- [x] Closed POS records provide **Create Another Transaction** without reopening the old transaction.
- [x] Same customer / vehicle information is carried into the new transaction while a new transaction number is generated.

### Payments
- [x] At least one valid payment is required before leaving the Payment step.
- [x] Mixed payments are supported.
- [x] Partial payments are supported and remain Pending until fully paid.
- [x] Non-cash payments require a reference number.
- [x] Card payments require Card Type.
- [x] Terminal Fee is captured and a 3% helper is available.
- [x] Overpayment is rejected client-side and server-side.
- [x] A POS cannot be closed until it is fully paid.

### Sales
- [x] Closed Sales are chronological by actual `closed_at`, newest first.
- [x] Sales table is compact; full information is shown in the Sales Details modal.
- [x] Sales Details includes the operational workbook fields captured by POS/customer/vehicle/payment records.
- [x] Sales CSV export follows the agreed workbook structure, with Checklist removed from the current export per the latest workflow decision.
- [x] Car Expenses are broken down into Online Payment Expense, Revolving Fund Expense and Stock Expenses/COGS.
- [x] **Sales Turnover** is the everyday Sales closing responsibility; the actual cash turned over is counted inside this task.

### Reports / pagination / notifications
- [x] Main transaction/history tables use chronological ordering and pagination.
- [x] Page sizes support 20 / 50 / 100 where the shared Pagination component is used.
- [x] HR has a **Weekly Cashier Compliance** view using Monday–Sunday periods.
- [x] HR compliance checks complete days using Sales + Revolving Fund Opening Cash Counts, Revolving Fund Closing Cash Count, Sales Turnover, and incidents.
- [x] Management reports include weekly Sales financial summaries and weekly Revolving Fund / RFP activity summaries.
- [x] Toast notifications auto-fade with success/info/warning/error timing and remain dismissible.

### Suppliers
- [x] Supplier management is not Cashier-facing.
- [x] Supplier management remains available only to authorized management roles.
- [x] Migration 013 adds server-side supplier write/read role protection.

### Accounts / temporary credentials
- [x] Super Admin creates a user without sending an invitation email.
- [x] A strong temporary password is generated.
- [x] One-time credential popup displays Username, Temporary Password, Role and Branch.
- [x] Copy Username / Copy Password / Copy All Credentials actions are available.
- [x] New accounts are marked **Pending First Login**.
- [x] First login requires a password change before operational RPCs can be used.
- [x] Super Admin can reset a temporary password and receive a new one-time credential popup.
- [x] The user's final password is never shown to Super Admin.

### Security hardening in migration 013
- [x] Cashier cannot read/write RFP finance records.
- [x] PB cannot read/write Cashier Sales/Revolving Fund operations.
- [x] HR reporting access cannot generate operational transaction numbers.
- [x] POS writes are restricted to Cashier / authorized management.
- [x] Supplier writes are restricted to authorized management.
- [x] Fund transaction ID prefixes are checked against the correct account/activity.
- [x] Daily Sales Handover IDs must use the `SALES-HO-*` format.

## Deployment order

For an existing database already through migration 011:

1. Back up / clone the Supabase database to staging.
2. Run `supabase/migration_012_master_revision.sql`.
3. Run `supabase/migration_013_role_scope_and_reporting.sql`.
4. Run `supabase/migration_014_plate_lookup_and_pos_polish.sql`.
5. Run `supabase/migration_015_sales_turnover_closing_flow.sql`.
6. Deploy this source revision.
7. Test each role separately: Cashier, PB, HR, Branch Manager/Admin and Super Admin.

## Important implementation notes

- The authorized Revolving Fund amount uses the existing branch field `branches.petty_cash_limit`. If it has no value, the UI shows **Not Set** and replenishment falls back to expenses since the last replenishment.
- Weekly HR compliance is automatically compiled by Monday–Sunday period **when the Reports screen is opened**. This build does not send an automatic email/message every Monday.
- The uploaded Sales workbook was partial-year reference data. The application/export logic is not hardcoded to those months and can continue across future months/years.
- Legacy database values such as `BOD`, `EOD`, `Petty Cash`, `Funds`, `Additional Funds`, and `fund_turnovers` remain internal for backward compatibility. User-facing labels use the new terminology.

## Validation in this package

- TypeScript/TSX syntax/transpile audit: required before packaging and recorded in the delivery message.
- ZIP integrity: required before delivery.
- Full `next build`: must still be run in a network-enabled staging/deployment environment because project npm dependencies are not installed in the authoring runtime.

## V4 — Plate-linked POS + UI polish
- [x] Plate Number input is uppercase alphanumeric only; spaces/dashes/symbols are ignored.
- [x] Existing plate suggestions are generated from previous POS history.
- [x] Selecting an existing plate auto-fills Year, Brand, Model, Client, Contact Number, Customer TIN, Address, and BS/SI when available.
- [x] Matched vehicles remain linked by canonical plate while every new POS keeps its own transaction number.
- [x] POS search also matches normalized plates regardless of spaces/dashes in the search text.
- [x] Checklist field removed from POS entry, Sales Details, and Sales CSV export UI.
- [x] POS popup redesigned into compact Vehicle Lookup, Customer Details, and Vehicle & Job Details cards.
- [x] Existing vehicle match is visibly identified in the POS popup.
- [x] Manual Cash Count submission button now remains disabled until a signature is present.
- [x] Migration 014 normalizes historical and future POS plate values at database level.


## V5 — Final Cashier Closing Flow
- [x] Cashier closing tasks reduced to **2 Required**.
- [x] **Revolving Fund Closing Cash Count** replaces the earlier separate “Reconciliation” task wording.
- [x] **Sales Turnover** replaces Daily Sales Handover in the Cashier UI.
- [x] Sales Turnover captures **Actual Cash Turned Over** and compares it with **Expected Cash Turnover**.
- [x] Sales Turnover requires **Received By** and a **Cashier Signature** before submission.
- [x] Standalone Sales EOD/Closing Cash Count is blocked for Cashier at database level by migration 015.
- [x] Close Cashier Shift is retired from the current UI and RPC access.
- [x] Notification bell and 4:50 PM reminder use the final two-task closing workflow.
- [x] Weekly HR compliance report no longer requires Shift Closure or Sales EOD count.

## V6 — PB RFP Dashboard & Disbursement PDF Workflow
- [x] PB gets a separate dashboard layout from Cashier.
- [x] RFP Balance is the primary left-side PB dashboard card.
- [x] RFP task area is placed on the right side of the PB dashboard.
- [x] PB Quick Actions and Recent Activity are placed below the top dashboard row.
- [x] Replenish RFP is replaced by Prepare RFP Disbursement.
- [x] RFP disbursement compiles unreimbursed RFP expense transaction numbers.
- [x] Every covered RFP expense must have receipt proof before request submission.
- [x] Supporting PDF is generated with request summary, transaction numbers, and receipt images.
- [x] Generated PDF is stored privately in Supabase evidence storage.
- [x] PB signature is required before submitting the disbursement request.
- [x] Management review supports Pending → Approved → Released, with rejection support.
- [x] RFP replenishment is posted only after an approved disbursement request is released.
- [x] Covered expense records cannot be reimbursed twice.
- [x] Direct generic RFP replenishment is blocked server-side.
- [x] Sidebar/navigation height is fixed to the viewport on desktop and scrolls independently from page content.
- [x] New migration: `migration_016_rfp_disbursement_and_pb_dashboard.sql`.

## V7 — PB RFP-only correction
- [x] PB dashboard has no daily Opening/Closing Cash Count tasks.
- [x] PB has no cash-count Incident Report action.
- [x] PB RFP Activity is not gated by daily cash counts.
- [x] PB notification bell has no RFP cash-count alerts.
- [x] Legacy RFP Handover UI removed from PB workflow.
- [x] Legacy RFP handover RPC revoked for authenticated users.
- [x] PB transaction numbering limited to RFP expense + disbursement request.
- [x] RFP expenses can be recorded without BOD/EOD cash counts.
- [x] RFP disbursement/replenishment remains the PB financial workflow.
