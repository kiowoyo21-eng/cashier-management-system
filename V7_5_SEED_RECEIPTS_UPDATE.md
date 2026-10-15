# V7.5 Seed Receipt Update

- Every seeded RFP transaction now has a proof attachment.
- Added proof for the seeded RFP replenishment.
- The seed SQL validates all six transaction proof objects before inserting demo rows.
- If `npm run seed:receipts` has not uploaded every file, the SQL seed stops with a clear error.
- The five expense receipts still total PHP 50,000 for disbursement-threshold testing.
