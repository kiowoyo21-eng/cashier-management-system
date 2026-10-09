# Cashier Management System — frontend prototype

Generic-branded Next.js + React frontend for deployment on Vercel via GitHub.

## Deploy with GitHub and Vercel
1. Create a new GitHub repository (for example `cashier-management-system`).
2. Upload **the contents of this folder** to the repository root, including `package.json` and `app/`.
3. On vercel.com choose **Add New → Project**, import your GitHub repository.
4. Framework should auto-detect **Next.js**. Leave build settings as default and click **Deploy**.
5. Open your Vercel URL for frontend testing.

## Local development
```
npm install
npm run dev
```

## Current limitations — read before testing
- FRONTEND DEMO ONLY. Data lives in the browser's `localStorage`. It is not shared between devices, browser profiles, or computers, and can be erased. Do not enter real financial or customer data.
- Demo account name/role are switchable in the header. There is **no login or authenticated authorization** yet. Role restrictions are illustrative only.
- The Petty Cash / Funds flow is implemented for UI testing: details → confirmation → signature → immediate balance change → pending approval → proof photo → admin approval/request explanation. A review action never changes the amount again.
- The receipt capture button in the transaction details is a **local device photo demo**. Secure one-time links and phone-to-laptop transfer cannot work without a backend/shared storage, and must not be mistaken as implemented.
- The demo POS wizard captures client and vehicle, quotation items, partial/multiple payment entries, optional additional services, COGS total, and closes when paid. Receipt enforcement and per-item COGS still require backend integration.
- Manual sales are add-only in the demo. No server-side idempotency or duplicate prevention yet.
- Signature snapshots and receipt snapshots in localStorage may hit browser storage limits. Use small demo images.
- Production phases: Supabase Auth + PostgreSQL + private Storage; true role/branch RLS; authoritative timestamps; immutable audit events; idempotent ledger; authenticated approval APIs; secure short-lived one-time camera capture tokens; receipt verification, POS COGS lines; real reports and discrepancy reconciliation.

## Security
Never use this frontend demo for real cash accounting or audit evidence. It is intentionally a workflow prototype; true identity, authorization, audit reliability and financial consistency require a server-side implementation.

## POS status update
New POS wizard submissions are saved as **Pending**, even with partial or zero payments. They are not included in finalized Sales until an explicit **Close Account** action, which requires full payment. This is only a browser-local prototype; server-side enforcement comes with the backend.
