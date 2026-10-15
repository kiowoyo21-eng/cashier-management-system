# V7 Update — PB RFP-Only Workflow

PB no longer has any daily cash-count or incident-report workflow.

## PB Dashboard
- RFP Balance remains on the left.
- Right-side Tasks now contains only RFP Disbursement status/action.
- Removed PB DailyTaskPanel from the dashboard.
- Quick Actions + Recent Activity remain below.

## Removed from PB
- RFP Opening Cash Count
- RFP Closing Cash Count
- Submit Incident Report
- Friday RFP Handover / RFP Handover
- Opening Cash Count gating on the RFP Activity page
- cash-count notifications

## RFP workflow now
1. Record RFP Expense (with receipt evidence)
2. Prepare RFP Disbursement Request
3. Generate/upload compiled supporting PDF
4. Management Approves
5. Management Releases
6. Released request posts the RFP replenishment

Only Sales uses Turnover.

## Database
Run `supabase/migration_017_pb_rfp_only_no_cash_counts.sql` after migration 016.
