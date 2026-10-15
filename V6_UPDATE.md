# V6 Update

This revision focuses on PB/RFP operations and the navigation layout.

## PB Dashboard
- Separate PB-only dashboard.
- RFP Balance on the left.
- RFP tasks on the right.
- Quick Actions and Recent Activity below.

## RFP Disbursement / Replenishment
RFP replenishment no longer uses the generic Add/Replenish Fund flow. PB prepares a Disbursement Request covering unreimbursed RFP expense transactions. Every expense must have receipt proof. The system generates a supporting PDF with the request summary, transaction numbers, and receipt images.

Management reviews the request through Approvals:
`Pending → Approved → Released`.

Release automatically posts the RFP replenishment to the ledger. Rejected requests release their covered expense transactions so they can be submitted again in a corrected request.

## Database
Run `supabase/migration_016_rfp_disbursement_and_pb_dashboard.sql` after migration 015.

## Navigation
The desktop sidebar now uses viewport height and its own scrolling, so it no longer stretches to match long page content.
