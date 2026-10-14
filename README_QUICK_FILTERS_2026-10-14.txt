UCMM HR MANAGEMENT SYSTEM — CLICKABLE KPI / QUICK-FILTER UPDATE
14 October 2026 — Consolidated project source

WHAT CHANGED
- Leave Management: summary cards for Pending Requests, Approved Leaves, and Approved Credit Changes filter the actual records table. Pending includes Pending and For Review. Selecting the active card a second time shows all records in that section. Status dropdown stays synchronized; search, pagination, and incompatible filters reset on shortcut selection.
- Employee 201: employee summary cards navigate to filtered directory lists (All, Regular, Probationary, Missing Documents). Clicking the active filter again clears it. Branch access restrictions stay intact.
- Recruitment: New Applications, Interviews Today, and Unscheduled show matching applicants directly in a Hiring Cycle table across positions. Pending Onboarding shows only Passed applicants; Clear Filter shows all onboarding records.
- Automatic Payroll: Awaiting Approval and Demo Previews filter actual payslip queue across all cutoffs (50 rows per page); Uploaded Cutoffs and Unresolved Employee Issues show their relevant records. Click active card again to clear it.
- Workflow Completion review: For Review and Awaiting Signature cards filter the matching workflow directory and retain branch/category constraints. Selection follows the filtered rows.
- Assets & Devices: status pills already filter the device table; now a second click on the active pill clears it to All.
- Shared UI: consistent active selection, hover, focus outline, button semantics, and aria-pressed where applicable.

SCOPE
- The quick-filter pattern is applied to KPI cards that have relevant underlying record lists. Purely informational metrics with no appropriate records list are not converted to misleading filters.
- No payroll calculations, employee datasets, loan logic, signing, or attendance import logic was intentionally modified in this UI batch.
- No changes to live Vercel or GitHub have been deployed by this package.

VALIDATION
- 63 TS/TSX files: syntax parse passed (0 syntax errors).
- app/globals.css: CSS syntax parser passed (0 parse errors).
- The complete Next.js production build and browser interaction tests remain UNVERIFIED, because project dependencies are not locally installed in this testing environment.

INSTALLATION
- Back up current GitHub repository.
- Extract this ZIP on your computer. Do NOT upload the ZIP itself to your repository.
- Replace matching repo files/folders with the extracted source and commit/push once (easiest via GitHub Desktop).
- Check Vercel build logs; after successful deployment review Leave Management first, then Employee 201, Recruitment, Automatic Payroll, and Assets.

TEST CHECKLIST
1. Leave Management > Pending Leave Requests > click Pending requests -> only Pending + For Review rows; click Approved leaves -> only Approved; click Approved credit changes -> credits list; click active card again -> all records.
2. Employee 201 > click Regular, Probationary, Missing Documents summary; confirm below table follows; click again to clear.
3. Recruitment Home > click New Applications, Interviews Today, Unscheduled, Pending Onboarding; verify the matching actual records display, not a generic overview.
4. Payroll > Automatic Payroll & Approval > click Awaiting HR Approval or Demo Previews; check queue and pagination; Uploaded Cutoffs and Unresolved Issues show relevant records.
5. Assets & Devices > click an active status pill twice; status resets to All.

IMPORTANT: Demo/browser-local system. Backend authorization and real payroll approval remain unverified.
