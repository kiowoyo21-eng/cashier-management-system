# V7.7 RFP Parts/Supplies + Formal Disbursement Workflow

## RFP expense scope
- RFP expenses are limited to `Part` or `Supply`.
- PB selects the branch that used the part/supply.
- RFP expense captures Supplier, Item Description, Qty, Unit Cost, Vehicle/Unit, Plate Number, Receipt No., CV No., VAT and receipt proof.
- Plate numbers are normalized to alphanumeric uppercase; `NA` is allowed for general shop supplies.

## Supporting PDF
- A4 landscape summary page with readable sizing.
- One consolidated transaction table with Branch column; no separate table per branch.
- Summary by Branch totals.
- Fund Summary:
  - Balance
  - Less: Expenses
  - Remaining
  - Add: Check Deposit
  - Available Balance
  - Amount Requested
- Prepared by = logged-in PB account.
- Verification/approval placeholders for Accounting and President.
- Receipt/supporting document pages follow the summary.

## Approval flow
- PB: `Pending Verification`
- Accounting: `Verify & Sign`
- President: `Approve & Sign`
- Accounting: `Release`
- E-signatures are stored as immutable request snapshots and audited.
- Accounting and President can save their signatures for future verification/approval.

## Database
Run `supabase/migration_019_rfp_parts_disbursement_approval.sql` after migration 018.

## Demo seed
The existing RFP seed now uses only Parts/Supplies, includes Unit/Plate data, totals PHP 50,000, and distributes sample expenses across available branches so the Branch Summary can be tested.
