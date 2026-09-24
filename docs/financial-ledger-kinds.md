# Financial Ledger Kind Dictionary (D4)

> Adds the D4 policy to Accounting Phase A/B and Phase C. Every `financial_transactions.event_type`
> is a **documented kind**. New kinds are added only via an additive migration +
> this entry. The ledger is an append-only event log — no amounts are ever mutated,
> no JSONB is used as a substitute for typed financial semantics.

## Kinds (Phase A — 20260901)

| event_type            | ref_table              | direction | Meaning |
| --------------------- | ---------------------- | --------- | ------- |
| `invoice_issued`      | `clinic_invoices`      | in        | Revenue snapshot booked (header total). |
| `invoice_voided`      | `clinic_invoices`      | out       | Bookkeeping void of an issued invoice (nothing deleted). |
| `payment_recorded`    | `clinic_payments`      | in        | **Cash in.** Actual money received (patient/payer). |
| `payment_voided`      | `clinic_payments`      | out/in    | Bookkeeping void of a payment row (amount untouched). |
| `refund_recorded`     | `clinic_payments`      | out       | **Cash out.** Money returned to the payer. |

## Kinds (Phase B — 20260902)

| event_type            | ref_table              | direction | Meaning |
| --------------------- | ---------------------- | --------- | ------- |
| `write_off_recorded`  | `clinic_adjustments`   | out       | **Not cash.** Receivable relieved because it is uncollectible (bad debt relief). Reduces receivable balance / aging; never touches `clinic_invoices.total` and never mixes with discount. |

## Kinds (Phase C — 20260903)

| event_type            | ref_table              | direction | Meaning |
| --------------------- | ---------------------- | --------- | ------- |
| `expense_recorded`    | `clinic_expenses`      | out       | Clinic operational expense booked from an immutable `clinic_expenses` row. **Cash out when `method='cash'`** (see Cash-flow protection); otherwise a non-cash money-out movement (card/bank_transfer/other). |
| `expense_voided`      | `clinic_expenses`      | in        | Bookkeeping reversal of an expense void (nothing deleted). Excluded from cash flow together with the now-voided `expense_recorded` source row. |

## Kinds (Insurance Foundation — 20260905)

| event_type       | ref_table      | direction | Meaning |
| ---------------- | -------------- | --------- | ------- |
| `claim_recorded` | `clinic_claims` | in       | **Not cash.** Insurance claim lodged (draft) against a payer for an issued invoice — an expected receivable from the payer. Never a payment; never cash. |
| `claim_settled`  | `clinic_claims` | in       | **Not cash.** Payer obligation confirmed (claim settled). The claim is the insurance entity — actual money arrives ONLY via `record_payment` (`payment_recorded`). Settlement never creates a payment row. |

## Kinds (Payroll Engine — 20261012)

| event_type           | ref_table          | direction | Meaning |
| -------------------- | ------------------ | --------- | ------- |
| `payroll_run`        | `payroll_periods`  | out       | **Cash out + EXPENSE** — the NET of a paid payroll period (one row per period, `event_key = payroll_run:<period_id>`). Since migration `20261018_payroll_pnl_integration.sql` it is counted in `financial_period_summary.expenses` (P&L) and in `cash_flow_summary.cashOut` (`method = 'bank_transfer'`). Advances were already handed over earlier, so this is the remaining money leaving the clinic at payment time. |
| `payslip_recorded`   | `payslips`         | out       | Documented, **not written yet** (Phase 2 — per-person posting). Never combine with `payroll_run` for the same period: it would double count. |
| `advance_paid`       | `staff_advances`   | out       | Documented, **not written yet** (Phase 2 — cash out when an advance is issued). |
| `advance_deducted`   | `staff_advances`   | in        | Documented, **not written yet** (Phase 2 — bookkeeping offset when a payroll recovers the advance; **not cash**). |



## Payroll reporting (approved — 20261018)

Owner-approved reporting change. `payroll_run` is now a **reported** kind:

- **P&L (`financial_period_summary`)** — `expenses` = Σ`expense_recorded` −
  Σ`expense_voided` + Σ`payroll_run`. The added `payroll` column exposes the
  payroll share on its own so the UI can disclose it, and `net_result`
  (= `revenue` − `refunds` − `expenses` − `bad_debt`) is therefore net of
  payroll.
- **Cash flow (`cash_flow_summary`)** — `payroll_run` joins `cashOut` under a
  fixed bucket `method = 'bank_transfer'`. `financial_transactions` has **no**
  `method` column, so the amount is taken from the ledger row itself and is
  never re-read from the source table.
- **No double counting** — the row amount is `payroll_periods.total_net`, already
  net of installments/deductions, and `expense_*` rows never contain payroll:
  `payroll_run` is written ONLY by `markPayrollPaid()`.
- **Advances are NOT expenses** — `advance_paid` / `advance_deducted` remain
  **deferred** (no code path writes them yet; 0 rows live). When they are
  written they must join the **cash flow only** — never `expenses`, never
  `net_result` — because an advance leaves the treasury and later comes back as
  a deduction.
- **A `payroll_run` row counts ONLY while its period is `status = 'paid'`** —
  both views `INNER JOIN public.payroll_periods` on `(clinic_id, id)` with
  `status = 'paid'`. The ledger is append-only (a trigger forbids UPDATE/DELETE
  and the engine has no reversal kind), so a read-time condition is the only
  honest defence. It neutralises two real states:
  - **Unlocked period (paid → draft)** — the ledger row stays but leaves the
    P&L and the cash grid. **Documented edge case:** a period that is unlocked
    and *never re-paid* keeps its money spent but loses its expense line; the
    expense returns as soon as the period is paid again (same `event_key`, so no
    second row is ever booked).
  - **Partial failure inside `markPayrollPaid()`** — the ledger insert happens
    *before* the `status='paid'` update, so a failed update could otherwise
    leave an orphan `payroll_run` row inflating expenses on an `approved`
    period.

## Cash-flow protection

`direction` alone is **never** a cash signal. Cash flows are identified ONLY by
explicit documented kinds, filtered by the source row's `method='cash'` and
recorded status:

- **Cash in:** `payment_recorded` (source `clinic_payments.method='cash'`)
- **Cash out:** `refund_recorded` (source `clinic_payments.method='cash'`) and — since Phase C — `expense_recorded` (source `clinic_expenses.method='cash'`). Since 20261018, `payroll_run` is a third cash-out kind and is **method-less** by design: it is bucketed as `bank_transfer` in `cash_flow_summary`.

Any cash-flow / closing / report query must filter by these explicit
`event_type`s + method; the Phase C `daily_cash_positions` view and the
`close_cash_session` RPC are implemented exactly this way.
`write_off_recorded`, `invoice_voided`, `payment_voided` and `expense_voided`
must be excluded from cash movement (voids are bookkeeping, not money).

## Cash variance (Phase C — PENDING DESIGN DECISION)

The cash register close (`close_cash_session`) stores `counted_amount` and the
derived `variance` (= counted − expected) as a **snapshot** on the closed
`clinic_cash_sessions` row. Variance is **displayed only — it is NOT booked to
the ledger**. Any variance posting (gain/loss kind, e.g. `cash_variance_*`)
requires a new documented kind + additive migration + explicit owner approval
before implementation.

## Discounts

`discount` is a **header snapshot** on `clinic_invoices`, applied at issuance:
it lowers the revenue total captured by `invoice_issued`. There is **no**
`discount_recorded` kind — discount is never re-booked as a separate movement
(to avoid double counting). Conceptually distinct from `write_off_recorded`
(which relieves an already-issued receivable).

## Future kinds (NOT yet implemented — do not use)

`cash_variance_recorded` (Phase C follow-up — pending owner decision) ·
`fee_recorded` …
Each requires an additive migration + a row in this table.
(`payroll_run` / `payslip_recorded` / `advance_paid` / `advance_deducted` moved
to **documented** with the Payroll Engine — 20261012, see the section above;
`claim_recorded` / `claim_settled` became ACTIVE kinds with the Insurance
Foundation — 20260905.)

## Insurance Foundation notes (20260905)

- Legacy `clinic_payments.method='insurance'` (Phase A) remains an untouched
  legacy signal: no new path uses it, no semantics are built on it (D-I5).
- `clinic_payments.claim_id` is an additive nullable reference for
  traceability ONLY — writing it is optional and never automatic.
- Claims skeleton states: `draft → submitted → settled | rejected` (state
  changes via SECURITY DEFINER RPCs only; rejected claims free the invoice's
  claimed-amount headroom; no ledger event on reject — audit log only).

---

Since migration `20261018_payroll_pnl_integration.sql`, `payroll_run` flows into BOTH reports:
`financial_period_summary.expenses` = `expense_recorded` − `expense_voided` + `payroll_run`
and `cash_flow_summary.cashOut` (`method = 'bank_transfer'`). A paid payroll period therefore
reduces the reported net profit — it is no longer excluded from P&L or the cash-flow views.

The other payroll kinds remain **not written yet** (`payslip_recorded` / `advance_paid` /
`advance_deducted`). Staff advances are **not an expense** — cash leaves and comes back — so when
they are written they must enter `cash_flow_summary` only (`advance_paid` = cash out at
disbursement, `advance_deducted` = cash in at recovery) and must NEVER be added to `expenses`
or `net_result`.

