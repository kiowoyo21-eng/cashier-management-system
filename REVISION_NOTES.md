# Cashier Management System — Cashier Workflow Polish

## Current revision

This build keeps the database-compatible legacy codes (`BOD`, `EOD`, `Additional Funds`, `fund_turnovers`) internally, but the cashier-facing interface uses clear operational terms.

### Cash-count workflow

- User-facing **Opening Cash Count** / **Closing Cash Count** terminology replaces BOD/EOD labels.
- Cashier module navigation is task-gated: if the required Opening Cash Count is missing, or the Closing Cash Count is required after 5:00 PM, clicking a protected cashier module opens the required cash-count task instead of bypassing it.
- At **4:50 PM Philippine Time**, the cashier receives a Closing Cash Count warning when one is still pending. “Remind Me Later” snoozes the reminder for about five minutes; at 5:00 PM the required-task gate takes over.
- Friday Fund Handover remains a scheduled **popup/modal task**, not a permanent full-page form.

### Fund and Petty Cash reporting

- Fund activity keeps two primary actions: **Replenish Fund** and **Record Expense**. Sales cash remains POS-derived.
- **Fund Reports / Handover Periods** are opened from a compact button and displayed only in a modal. Completed Friday Fund Handovers automatically close reporting periods.
- **Petty Cash Reports** are opened from a compact button and displayed only in a modal. Monthly summaries are automatic; Custom Date Range is user-selected.
- CSV export remains available from report periods/ranges.

### POS / Sales

- POS quotation lines require **Type: Service or Part**, Description, Qty, Unit Price and Total.
- Quantity and Unit Price inputs are compact, aligned and numeric.
- A valid payment is required before the POS wizard can continue beyond Payment. Non-cash methods require a reference number. Migration 011 enforces the same rules server-side.
- Closed POS and Sales records include **Create Another Transaction**, which starts a new transaction using the same customer/vehicle without reopening or changing the closed record.
- Sales Details is compact by default, with secondary quotation/payment/COGS data in expandable sections.
- POS vehicle filters use searchable autocomplete for Year Model, Car Brand and Car Model / Unit. Vehicle placeholders were shortened for readability.
- Transaction/history pagination and chronological ordering remain enabled; finalized Sales use actual `closed_at` ordering.

### Notifications and roles

- Toast notifications automatically fade out (success/info ~3s, warning ~4s, error ~5s) and remain manually dismissible.
- Supplier management is no longer cashier-facing. Supplier/Vehicle management remains available to authorized management roles only.

## Database migration

For an existing database already migrated through migration 010, run:

`supabase/migration_011_cashier_workflow_polish.sql`

Migration 011:
- backfills historical quotation items with `Service` when an old record has no type;
- enforces Service/Part type on all future POS item write paths;
- requires at least one POS payment at creation;
- requires a reference for non-cash payments;
- provides `add_pos_payment_v2` for referenced digital payments;
- adds the 5:00 PM Closing Cash Count server-side gate while preserving earlier discrepancy/missed-count safeguards.

## Validation performed here

- All TypeScript/TSX source files were parsed with the installed TypeScript compiler API: **0 syntax errors**.
- Full `tsc --noEmit` / `next build` could not complete because this environment does not have the project npm dependencies installed, and the npm package cache does not contain all required packages.
- Run `npm install && npm run build` in a network-enabled staging/deployment environment before production use.
- Run migration 011 on a staging Supabase copy first and test the cash-count gates, payment validation, report modals, POS creation/additional transactions, corrections, signatures, and camera proof before production rollout.
