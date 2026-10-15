# V7.4 Update

- Added three receipt-proof options for RFP/Revolving Fund expense records with missing proof: Use Device Camera, Upload Receipt Image, and Use Phone Camera QR/link.
- PB can save a signature and explicitly reuse it for future RFP disbursement requests. Each submitted request still stores its own signature snapshot.
- Added migration `migration_018_pb_saved_signature.sql`.
- Added five fake seed receipt PNGs plus a demo signature for staging/development.
- Added `npm run seed:receipts` to upload demo receipt files to the private `transaction-evidence` bucket.
- Updated `seed_001_rfp_pb_demo.sql` so all five demo RFP expenses reference receipt proof and still total PHP 50,000.
