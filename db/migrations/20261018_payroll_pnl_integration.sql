-- ============================================================================
-- 20261018_payroll_pnl_integration.sql — Payroll enters P&L and Cash Flow.
--
-- WHY: paid payroll periods (ledger kind `payroll_run`, written by the payroll
-- engine — 20261012) were deliberately kept OUT of financial_period_summary and
-- cash_flow_summary. A clinic with 5,800 of PAID salaries therefore reported
-- 0 expenses (income 2,010 → "net" 2,010 / margin 100%), which is a real
-- profitability lie. The owner approved the reporting change; this file is the
-- additive reporting migration + dictionary entry that change required.
--
-- WHAT (reporting views only — no ledger change, no new kind, no data touched):
--   * financial_period_summary:
--       - `payroll_run` joins the kind list;
--       - expenses = expense_recorded − expense_voided + payroll_run;
--       - NEW column `payroll` (payroll alone) so the UI can disclose the split;
--       - net_result keeps its documented shape (revenue − refunds − expenses −
--         bad_debt) and therefore carries payroll too — never a second formula.
--   * cash_flow_summary:
--       - NEW CTE `pr` feeds payroll_run into the month/method grid as cash OUT.
--       - payroll_run carries NO `method` (the ledger has no such column, and the
--         engine is out of scope), so it is booked into the fixed, documented
--         bucket 'bank_transfer'. Salaries leave as a transfer, never as till cash.
--
-- SCOPE DECISIONS (owner, 2026-09-23):
--   * Advances are NOT added. `advance_paid` / `advance_deducted` are still
--     written by NO code path (0 rows live; dictionary says "not written yet"),
--     so adding them here would report nothing and would require a second
--     writer — out of scope. Deferred, and documented as deferred in
--     docs/financial-ledger-kinds.md.
--     No double count today: `payroll_run.amount = payroll_periods.total_net` is
--     ALREADY net of every advance recovered in that period.
--   * Month attribution stays `occurred_at` (clinic-local month) — the existing
--     cash basis of this view. A July payroll paid in September lands in
--     September, exactly like a July expense paid in September.
--   * One row per period is guaranteed by the engine (`event_key =
--     payroll_run:<period_id>`), so a plain SUM cannot double count.
--   * A `payroll_run` row counts ONLY while its period is still
--     `payroll_periods.status = 'paid'` (owner decision, 2026-09-23). The ledger
--     is append-only — a trigger forbids UPDATE/DELETE (20260901) and the engine
--     has no reversal kind — so this read-time condition is the ONLY honest way
--     to keep the P&L free of rows whose period no longer stands. It closes two
--     real states without touching the engine:
--       (a) UNLOCKED period (paid → draft, 20261016): the row stays in the
--           ledger but drops out of the P&L. DOCUMENTED EDGE CASE — a period
--           that is unlocked and NEVER re-paid loses its salary expense from the
--           P&L even though the money WAS handed over. Re-paying restores it
--           (same `event_key`, so no second row is ever booked).
--       (b) PARTIAL FAILURE in `markPayrollPaid` (the ledger insert happens
--           BEFORE the status='paid' update, so a failed update can leave an
--           orphan row on an 'approved' period): that orphan can no longer
--           inflate expenses.
--   * Staff ADVANCES stay deferred in BOTH views (no cost line, no cash line):
--     `advance_paid` / `advance_deducted` are still written by NO code path
--     (0 rows live) and `total_net` is already net of the advances recovered in
--     the period, so feeding them here would double count the day a writer
--     lands. Documented as deferred in docs/financial-ledger-kinds.md.
--
-- `security_invoker = true` is RE-APPLIED to both views: `drop view` +
-- `create view` resets reloptions, and the 20260907 posture (RLS respected
-- end-to-end) must survive this migration.
--
-- 20260907 remains the untouched historical record; this file is additive.
--
-- LEDGER-DICTIONARY NOTE (moved here from 20261012, which is an untouched record
-- again): `payroll_run` is INCLUDED in the P&L expenses and in the cash-flow
-- outflows (fixed method bucket 'bank_transfer') as of this migration
-- (owner-approved). It feeds financial_period_summary.expenses and
-- cash_flow_summary.cashOut; staff advances stay cash-flow-only in the
-- dictionary's Phase-2 intent and are NOT part of P&L.
--
-- Wrapped in ONE transaction: `begin` … `commit`. `drop view` + `create view`
-- are transactional in Postgres, so a failure anywhere (including the
-- security_invoker guard at the end) leaves both views EXACTLY as they were —
-- never dropped-and-not-recreated.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) financial_period_summary — P&L source. Identical shape to 20260907 plus
--    payroll; `payroll` is appended LAST so the pre-existing column order is
--    preserved for every `select *` consumer.
-- ---------------------------------------------------------------------------
drop view if exists public.financial_period_summary;

create view public.financial_period_summary as
with tz as (
  select c.id as clinic_id,
         coalesce(cs.timezone, 'UTC') as tz
    from public.clinics c
    left join public.clinic_settings cs on cs.clinic_id = c.id
),
monthly as (
  select
    ft.clinic_id,
    date_trunc('month', (ft.occurred_at at time zone t.tz))::date as period_month,
    ft.event_type,
    sum(ft.amount) as total
  from public.financial_transactions ft
  join tz t on t.clinic_id = ft.clinic_id
  where ft.event_type in ('invoice_issued', 'invoice_voided', 'refund_recorded',
                          'expense_recorded', 'expense_voided', 'write_off_recorded')
  group by ft.clinic_id, t.tz, date_trunc('month', (ft.occurred_at at time zone t.tz)), ft.event_type
),
-- PAYROLL BRANCH — deliberately SEPARATE so the main ledger scan above keeps the
-- exact plan shape it had in 20260907 (no extra join on the hot path). It reads
-- only `payroll_run` rows (one per paid period) and keeps a period's row ONLY
-- while `payroll_periods.status = 'paid'`; see the header for the two states
-- this neutralises. INNER JOIN on (clinic_id, id) is a single PK probe.
payroll_monthly as (
  select
    ft.clinic_id,
    date_trunc('month', (ft.occurred_at at time zone t.tz))::date as period_month,
    'payroll_run'::text as event_type,
    sum(ft.amount) as total
  from public.financial_transactions ft
  join tz t on t.clinic_id = ft.clinic_id
  join public.payroll_periods pp
    on pp.clinic_id = ft.clinic_id
   and pp.id = ft.ref_id
   and pp.status = 'paid'
  where ft.event_type = 'payroll_run'
    and ft.ref_table = 'payroll_periods'
  group by ft.clinic_id, t.tz, date_trunc('month', (ft.occurred_at at time zone t.tz))
),
-- Union of the untouched ledger branch + the conditional payroll branch. The
-- SELECT below is byte-for-byte the 20260907 formula, so `payroll_run` flows
-- into `expenses` (and therefore `net_result`) through the SAME single formula.
all_months as (
  select * from monthly
  union all
  select * from payroll_monthly
)
select
  clinic_id,
  period_month,
  coalesce(sum(total) filter (where event_type = 'invoice_issued'), 0)
    - coalesce(sum(total) filter (where event_type = 'invoice_voided'), 0) as revenue,
  coalesce(sum(total) filter (where event_type = 'refund_recorded'), 0)    as refunds,
  coalesce(sum(total) filter (where event_type = 'expense_recorded'), 0)
    - coalesce(sum(total) filter (where event_type = 'expense_voided'), 0)
    + coalesce(sum(total) filter (where event_type = 'payroll_run'), 0)    as expenses,
  coalesce(sum(total) filter (where event_type = 'write_off_recorded'), 0) as bad_debt,
  coalesce(sum(total) filter (where event_type = 'invoice_issued'), 0)
    - coalesce(sum(total) filter (where event_type = 'invoice_voided'), 0)
    - coalesce(sum(total) filter (where event_type = 'refund_recorded'), 0)
    - (coalesce(sum(total) filter (where event_type = 'expense_recorded'), 0)
       - coalesce(sum(total) filter (where event_type = 'expense_voided'), 0)
       + coalesce(sum(total) filter (where event_type = 'payroll_run'), 0))
    - coalesce(sum(total) filter (where event_type = 'write_off_recorded'), 0) as net_result,
  coalesce(sum(total) filter (where event_type = 'payroll_run'), 0)         as payroll
from all_months
group by clinic_id, period_month;

-- ---------------------------------------------------------------------------
-- 2) cash_flow_summary — Cash Flow source (D-R2). Identical to 20260907 plus a
--    NEW CTE `pr`: `payroll_run` is a real money OUT movement, so a paid payroll
--    must appear in the cash grid (otherwise the clinic's outflow is understated
--    by its whole salary bill — 5,800 in the clinic that exposed this).
--    The ledger row carries NO method (financial_transactions has no such column
--    and the engine is out of scope), so a payroll run is booked in the fixed,
--    documented bucket 'bank_transfer' — salaries leave as a transfer, never as
--    till cash. `direction` is STILL never used as a cash signal.
--    Advances stay OUT (header decision): advance_paid / advance_deducted have no
--    writer yet, and total_net is already net of the advances recovered in the
--    period — feeding them here would double count the day they are written.
-- ---------------------------------------------------------------------------
drop view if exists public.cash_flow_summary;

create view public.cash_flow_summary as
with tz as (
  select c.id as clinic_id,
         coalesce(cs.timezone, 'UTC') as tz
    from public.clinics c
    left join public.clinic_settings cs on cs.clinic_id = c.id
),
pay as (
  select
    ft.clinic_id,
    date_trunc('month', (ft.occurred_at at time zone t.tz))::date as flow_month,
    p.method,
    coalesce(sum(ft.amount) filter (where ft.event_type = 'payment_recorded'), 0) as inflows,
    coalesce(sum(ft.amount) filter (where ft.event_type = 'refund_recorded'), 0)  as outflows
  from public.financial_transactions ft
  join public.clinic_payments p on p.clinic_id = ft.clinic_id and p.id = ft.ref_id
  join tz t on t.clinic_id = ft.clinic_id
  where ft.event_type in ('payment_recorded', 'refund_recorded')
    and ft.ref_table = 'clinic_payments'
  group by ft.clinic_id, t.tz, date_trunc('month', (ft.occurred_at at time zone t.tz)), p.method
),
exp as (
  select
    ft.clinic_id,
    date_trunc('month', (ft.occurred_at at time zone t.tz))::date as flow_month,
    e.method,
    0::numeric as inflows,
    coalesce(sum(ft.amount) filter (where ft.event_type = 'expense_recorded'), 0)
      - coalesce(sum(ft.amount) filter (where ft.event_type = 'expense_voided'), 0) as outflows
  from public.financial_transactions ft
  join public.clinic_expenses e on e.clinic_id = ft.clinic_id and e.id = ft.ref_id
  join tz t on t.clinic_id = ft.clinic_id
  where ft.event_type in ('expense_recorded', 'expense_voided')
    and ft.ref_table = 'clinic_expenses'
  group by ft.clinic_id, t.tz, date_trunc('month', (ft.occurred_at at time zone t.tz)), e.method
),
pr as (
  select
    ft.clinic_id,
    date_trunc('month', (ft.occurred_at at time zone t.tz))::date as flow_month,
    'bank_transfer'::text as method,
    0::numeric as inflows,
    coalesce(sum(ft.amount) filter (where ft.event_type = 'payroll_run'), 0) as outflows
  from public.financial_transactions ft
  join tz t on t.clinic_id = ft.clinic_id
  -- Same conditional as the P&L branch: a payroll outflow exists in the cash grid
  -- only while its period is `paid` (see the header for the unlocked-period edge
  -- case). INNER JOIN on (clinic_id, id) uses the PK / composite unique index.
  join public.payroll_periods pp
    on pp.clinic_id = ft.clinic_id
   and pp.id = ft.ref_id
   and pp.status = 'paid'
  where ft.event_type = 'payroll_run'
    and ft.ref_table = 'payroll_periods'
  group by ft.clinic_id, t.tz, date_trunc('month', (ft.occurred_at at time zone t.tz))
),
combined as (
  select * from pay
  union all
  select * from exp
  union all
  select * from pr
)
select
  clinic_id,
  flow_month,
  method,
  sum(inflows) as inflows,
  sum(outflows) as outflows,
  sum(inflows) - sum(outflows) as net
from combined
group by clinic_id, flow_month, method;

-- ---------------------------------------------------------------------------
-- 3) security_invoker — RE-APPLIED after the drop/create above. Recreating a
--    view resets its reloptions, so without this the P&L and cash-flow views
--    would silently revert to OWNER privileges (base-table RLS bypassed) —
--    exactly the posture 20260907 / 20260925 closed. Service-role callers are
--    unaffected (RLS bypass by design); this keeps the authenticated posture
--    identical to the one this migration inherited.
-- ---------------------------------------------------------------------------
alter view public.financial_period_summary set (security_invoker = true);
alter view public.cash_flow_summary       set (security_invoker = true);

-- Fail loudly instead of silently shipping a view with the wrong posture.
do $$
declare
  v record;
begin
  for v in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and c.relname in ('financial_period_summary', 'cash_flow_summary')
  loop
    if not exists (
      select 1
        from pg_class c2
        join pg_namespace n2 on n2.oid = c2.relnamespace
       where n2.nspname = 'public'
         and c2.relname = v.relname
         and coalesce(c2.reloptions, '{}'::text[])::text like '%security_invoker=true%'
    ) then
      raise exception 'security_invoker not applied to %', v.relname;
    end if;
  end loop;
end $$;

-- REVERSIBILITY (documented; NOT executed):
--   Re-apply db/migrations/20260907_financial_reporting.sql (verbatim) to take
--   `payroll_run` back OUT of both views, then re-apply
--     alter view public.financial_period_summary set (security_invoker = true);
--     alter view public.cash_flow_summary       set (security_invoker = true);
--   Neither direction touches a ledger row: the `payroll_run` rows in
--   financial_transactions stay exactly as the engine wrote them. Nothing is
--   dropped, so no historical data is lost in either direction.

commit;

-- ============================================================================
-- END — Payroll enters P&L / cash flow. Reporting views only: no ledger kind
-- added, no data mutated, no engine change, no advance writer introduced, no
-- historical migration edited (20260907 stays the untouched record).
-- ============================================================================
