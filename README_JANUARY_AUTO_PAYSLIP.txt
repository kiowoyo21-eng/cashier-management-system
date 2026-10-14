UCMM HR — JANUARY–OCTOBER AUTOMATIC PAYSLIP PREVIEWS
October 14, 2026 | Complete consolidated source update

WHY THIS UPDATE
Prior historical January–October fictional attendance appeared only in Attendance Records.
The automatic pay engine only reacted to verified uploads, so January payslip previews
were not generated. This consolidates the latest source and corrects that disconnect.

WHAT CHANGED
1. lib/demoAutoPayslip.ts (new)
   Generates individual historical DEMO payslip drafts for every completed weekly
   cutoff in the Jan–Oct 2026 simulated data, after each employee's hire date.
   Preserves existing original payroll releases, manually created drafts, and signatures.
   Does not create money transfers or real payroll releases.
2. lib/hrState.tsx
   Backfills historical previews automatically when the app loads (including users
   with already-saved browser records), and when demo data is reset.
   Idempotent: does not duplicate employee/cutoff snapshots on reload.
3. lib/autoPayroll.ts
   Verified uploaded attendance now replaces the matching simulated preview for
   that employee/cutoff, sending a complete computation to HR approval.
4. components/PayrollOperationsHub.tsx
   Automatic Payslip Queue shows historical previews, with a January–October month
   filter. Payslip History has a separate Unreleased Previews table per cutoff week.
   Review modal contains formal payslip preview; unapproved amounts are not final.
5. lib/printPayslip.ts
   Unapproved previews explicitly show UNAPPROVED PREVIEW / NOT RELEASED and
   omit the Received By signature line.

QA RESULTS (LOCAL)
- 35 simulated employees, 6,535 fictional DTR rows.
- 805 auto-generated unreleased previews, including 75 with January 2026 starts.
- No pre-hire drafts, no duplicate employee/cutoff, no future unfinished period.
- Gross − Deductions = Net; historical reconciliation runs idempotently.
- Complete verified CSV replaces existing simulated draft for matching cutoff.
- Formal preview includes required earnings/deductions and marks pending status.
- Source-wide TypeScript check with local QA stubs: PASS.
- FULL NEXT.JS/VERCEL BUILD AND LIVE BROWSER TEST: NOT VERIFIED.

IMPORTANT SAFETY / LIMITATIONS
- Historical DTRs, salaries and calculations are FICTIONAL DEMO records.
- DEMO previews stay as Draft (Needs Verified Attendance), not automatically Approved
  or Released. Simulated OT is excluded until supervisory approval; unpaid/unmatched
  leave, ECOLA, holidays, taxes and contributions require HR validation.
- Upload a real cutoff's complete valid CSV (by branch) to replace demo previews
  with automatic For Review records. No Generate Draft button is needed.
- Existing CSV uploader is one branch and one Thursday–Wednesday cutoff at a time;
  it is NOT a bulk monthly importer and is browser-local. This patch does not add
  production attendance sync or real payroll capability.
- 13th-month estimates remain separately computed; unreleased demo previews are
  not treated as verified basic salary earned.

INSTALL IN GITHUB (ONE COMMIT)
1. Download and EXTRACT this ZIP locally (do not upload ZIP itself to GitHub).
2. Copy app/, components/, lib/, public/, package.json and config files into the
   existing GitHub repository root, preserving each path and replacing counterparts.
3. Commit and push once (GitHub Desktop recommended for folder replacement).
4. Check Vercel build log and test:
   Payroll Management > Automatic Payroll & Approval > Period/Month = January 2026
   Payroll Management > Payslip History > January 2026 > any cutoff week
   Verify initial DEMO preview, no release until HR approves verified upload.
