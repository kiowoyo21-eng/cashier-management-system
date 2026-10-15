# V7.3 PB RFP Dashboard Update

- Simplified the RFP Balance card to show only:
  - RFP Balance
  - Expenses (unreimbursed)
  - Latest Replenishment
- Added an RFP disbursement alert when unreimbursed expenses reach PHP 50,000 or more.
- Added the same alert to the PB notification bell.
- The Prepare Disbursement quick action becomes visually emphasized at the threshold.
- Added optional staging/demo seed SQL: `supabase/seed_001_rfp_pb_demo.sql`.
  - Demo replenishment: PHP 100,000
  - Demo unreimbursed expenses: PHP 50,000
  - Demo balance: PHP 50,000
  - Seed is for testing only and does not include real receipt files.
