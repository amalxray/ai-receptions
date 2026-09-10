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

## Cash-flow protection

`direction` alone is **never** a cash signal. Cash flows are identified ONLY by
explicit documented kinds, filtered by the source row's `method='cash'` and
recorded status:

- **Cash in:** `payment_recorded` (source `clinic_payments.method='cash'`)
- **Cash out:** `refund_recorded` (source `clinic_payments.method='cash'`) and — since Phase C — `expense_recorded` (source `clinic_expenses.method='cash'`)

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
`payroll_run` / `payslip_recorded` (Payroll Foundation) · `fee_recorded` …
Each requires an additive migration + a row in this table.
(`claim_recorded` / `claim_settled` became ACTIVE kinds with the Insurance
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