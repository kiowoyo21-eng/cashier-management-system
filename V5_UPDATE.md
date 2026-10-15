# V5 Update — Cashier Closing Flow

## Included

- Cashier closing tasks are now exactly **2 Required**:
  1. Revolving Fund Closing Cash Count
  2. Sales Turnover
- Removed standalone Sales Closing Cash Count from the Cashier workflow.
- Removed the Close Cashier Shift task/button from the current UI.
- Sales Turnover now captures:
  - Gross Sales
  - Cash Sales
  - Card collections
  - GCash / Bank / Cheque collections
  - Sales Opening Cash
  - Expected Cash Turnover
  - Actual Cash Turned Over
  - Short / Over
  - Transaction count
  - BS/SI range
  - Received By
  - Remarks
  - required Cashier signature
  - optional photo/proof
- 4:50 PM warning now checks Revolving Fund Closing Cash Count + Sales Turnover only.
- Notification bell uses the same final two-task closing workflow.
- At 5:00 PM, protected Cashier operations gate to the missing closing responsibility.
- Sales activity is locked after today's Sales Turnover is submitted.
- Weekly HR compliance now checks:
  - Sales Opening Cash Count
  - Revolving Fund Opening Cash Count
  - Revolving Fund Closing Cash Count
  - Sales Turnover
  - incidents
- Shift Closure is no longer required by HR compliance.
- Sales Turnover History replaces the old Daily Sales Handover wording in the UI.
- Signature remains mandatory for cash counts, incident reports, and Sales Turnover.
- Database migration 015 blocks new Cashier Sales EOD count records and introduces the `submit_sales_turnover` RPC.

## Preserved from V4

- Cashier = Sales + Revolving Fund.
- PB = RFP.
- Plate normalization and existing-vehicle lookup/autofill.
- Separate POS transaction for repeated plate numbers.
- Checklist removed from current POS/Sales UI.
- Required POS payment validation, mixed/partial payments, Service/Part quotation types.
- Temporary credentials + forced first-login password change.
- Pagination, chronological records, compact Sales details, fading notifications.

## Not converted in this V5 package

The existing Revolving Fund replenishment transaction remains the release/receipt workflow. A separate weekly **Disbursement Request** object with its own approval/release state machine has not been introduced in migration 015 because the approving role/workflow still needs to be locked down before adding another financial record type.
