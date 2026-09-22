-- ============================================================================
-- Payroll Engine (Phase 1) — periods · payslips · advances · adjustments
--
-- Depends on (all pre-existing, verified live): providers, clinic_settings,
-- clinic_provider_compensations, invoice_items/clinic_invoices (via the
-- derived provider_revenue view), financial_transactions.
--
-- Design decisions (owner-approved for this phase):
--   D-P1  providers IS the staff registry (provider_type='staff' exists; each
--         row carries user_id → auth.users). NO separate staff table.
--   D-P2  Commission base = the DERIVED view public.provider_revenue
--         ('issued' base: non-voided invoices, clinic-local month). The engine
--         never re-derives revenue from invoice rows by itself.
--   D-P3  Visibility = FINANCE RBAC at the API layer.
--   D4    New ledger kinds are added here ADDITIVELY + documented in
--         docs/financial-ledger-kinds.md.
--
-- CONFLICTS FOUND IN THE ORIGINAL SPEC (resolved here, see notes inline):
--   (1) `financial_transactions.event_type` CHECK allowed NO payroll kind →
--       the insert in markPayrollPaid would have raised a constraint violation.
--       Fixed: additive drop+add of the CHECK with the four documented kinds.
--   (2) invoice_items has NO `amount` column (it is `line_total`) and no
--       void-awareness → ad-hoc commission math would count VOIDED invoices.
--       Fixed: commission reads provider_revenue (D-P2).
--   (3) No tenant FKs on provider_id → a payslip could reference another
--       clinic's provider. Fixed: composite FK (clinic_id, provider_id) →
--       providers(clinic_id, id), same pattern as clinic_provider_compensations.
--   (4) payslip_adjustments existed but the engine ignored them (bonuses and
--       deductions would always be 0). Fixed in the engine.
--   (5) Currency was hard-coded 'ILS'; the platform is multi-market
--       (D3 Localization). Fixed: read from clinic_settings.currency.
--   (6) Salary rows readable by EVERY clinic member is a privacy hazard.
--       Fixed: RLS = clinic admin, or the member themself.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) payroll_periods — one period per clinic per month ('YYYY-MM').
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  period_month text not null,
  status text not null default 'draft'
    check (status in ('draft','approved','paid','cancelled')),
  total_base numeric(12,2) not null default 0,
  total_commission numeric(12,2) not null default 0,
  total_bonuses numeric(12,2) not null default 0,
  total_deductions numeric(12,2) not null default 0,
  total_advances numeric(12,2) not null default 0,
  total_net numeric(12,2) not null default 0,
  currency text not null default 'ILS',
  notes text,
  created_by uuid references auth.users(id),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  paid_at timestamptz,
  paid_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Format guard: the engine and the month-column analytics assume 'YYYY-MM'.
  constraint payroll_periods_month_format check (period_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  unique (clinic_id, period_month),
  unique (clinic_id, id)
);

create index if not exists idx_payroll_periods_clinic
  on public.payroll_periods (clinic_id, period_month desc);

-- ---------------------------------------------------------------------------
-- 2) payslips — one row per (period, provider). Immutable once the period
--    leaves 'draft' (guard trigger below).
-- ---------------------------------------------------------------------------
create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider_id uuid not null,
  base_amount numeric(12,2) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  bonuses_amount numeric(12,2) not null default 0,
  deductions_amount numeric(12,2) not null default 0,
  advances_amount numeric(12,2) not null default 0,
  revenue_attributed numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null default 0,
  currency text not null default 'ILS',
  notes text,
  breakdown jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (payroll_period_id, provider_id),
  unique (clinic_id, id),
  -- (3) tenant integrity: the provider must belong to the SAME clinic.
  foreign key (clinic_id, provider_id) references public.providers (clinic_id, id) on delete restrict
);

create index if not exists idx_payslips_period on public.payslips (payroll_period_id);
create index if not exists idx_payslips_provider on public.payslips (clinic_id, provider_id);

-- ---------------------------------------------------------------------------
-- 3) staff_advances — money handed to a person, recovered from a later period.
-- ---------------------------------------------------------------------------
create table if not exists public.staff_advances (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  reason text,
  status text not null default 'pending'
    check (status in ('pending','deducted','cancelled')),
  issued_at date not null default current_date,
  deducted_in_period_id uuid references public.payroll_periods(id) on delete set null,
  deducted_at timestamptz,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (clinic_id, id),
  foreign key (clinic_id, provider_id) references public.providers (clinic_id, id) on delete restrict,
  -- a deducted advance must point at the period that deducted it
  check (status <> 'deducted' or deducted_in_period_id is not null)
);

create index if not exists idx_staff_advances_provider
  on public.staff_advances (clinic_id, provider_id, status);
create index if not exists idx_staff_advances_clinic
  on public.staff_advances (clinic_id, issued_at desc);
-- Deduction scan only ever looks at pending rows.
create index if not exists idx_staff_advances_pending
  on public.staff_advances (clinic_id, provider_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- 4) payslip_adjustments — bonuses / deductions for a (period, provider).
-- ---------------------------------------------------------------------------
create table if not exists public.payslip_adjustments (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  provider_id uuid not null,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  type text not null check (type in ('bonus','deduction')),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique (clinic_id, id),
  foreign key (clinic_id, provider_id) references public.providers (clinic_id, id) on delete restrict
);

create index if not exists idx_payslip_adj_period
  on public.payslip_adjustments (payroll_period_id, provider_id);



-- ---------------------------------------------------------------------------
-- 5) State machine + immutability guards (project convention: DB-enforced).
-- ---------------------------------------------------------------------------
create or replace function public.payroll_periods_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'PAYROLL_PERIOD_NO_DELETE';
  end if;

  -- tenant + month are the identity of a period — never editable
  if new.clinic_id is distinct from old.clinic_id then
    raise exception 'PAYROLL_PERIOD_TENANT_IMMUTABLE';
  end if;
  if new.period_month is distinct from old.period_month then
    raise exception 'PAYROLL_PERIOD_MONTH_IMMUTABLE';
  end if;

  -- totals are engine-owned and only while the period is a draft
  if old.status <> 'draft' and (
       new.total_base is distinct from old.total_base
    or new.total_commission is distinct from old.total_commission
    or new.total_bonuses is distinct from old.total_bonuses
    or new.total_deductions is distinct from old.total_deductions
    or new.total_advances is distinct from old.total_advances
    or new.total_net is distinct from old.total_net
  ) then
    raise exception 'PAYROLL_PERIOD_LOCKED';
  end if;

  -- transitions: draft → approved → paid · draft/approved → cancelled (terminal)
  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status in ('approved','cancelled') then null;
    elsif old.status = 'approved' and new.status in ('paid','cancelled') then null;
    else raise exception 'PAYROLL_PERIOD_INVALID_TRANSITION';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists payroll_periods_guard on public.payroll_periods;
create trigger payroll_periods_guard
  before update or delete on public.payroll_periods
  for each row execute function public.payroll_periods_guard();

-- Payslips are engine-owned: writable ONLY while the parent period is a draft.
-- NOTE: NEW/OLD are only dereferenced for the operation that assigns them
-- (touching NEW inside DELETE raises "record new is not assigned yet").
create or replace function public.payslips_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_period_id := old.payroll_period_id;
  else
    v_period_id := new.payroll_period_id;
  end if;

  select status into v_status from public.payroll_periods where id = v_period_id;
  if v_status is null then
    raise exception 'PAYROLL_PERIOD_NOT_FOUND';
  end if;
  if v_status <> 'draft' then
    raise exception 'PAYROLL_PAYSLIP_PERIOD_LOCKED';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists payslips_guard on public.payslips;
create trigger payslips_guard
  before insert or update or delete on public.payslips
  for each row execute function public.payslips_guard();

-- Advances: only a pending advance may be deleted; a deducted one is history.
create or replace function public.staff_advances_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'deducted' then
      raise exception 'ADVANCE_ALREADY_DEDUCTED';
    end if;
    return old;
  end if;

  if new.clinic_id is distinct from old.clinic_id then
    raise exception 'ADVANCE_TENANT_IMMUTABLE';
  end if;
  if old.status = 'deducted' and new.status <> 'deducted' then
    -- The ONLY allowed reversal: cancelling the period that deducted it.
    if not (new.status = 'pending' and new.deducted_in_period_id is null and new.deducted_at is null) then
      raise exception 'ADVANCE_ALREADY_DEDUCTED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_advances_guard on public.staff_advances;
create trigger staff_advances_guard
  before update or delete on public.staff_advances
  for each row execute function public.staff_advances_guard();

-- ---------------------------------------------------------------------------
-- 6) D4 — ledger kind dictionary. CONFLICT FIX (1): the Phase C CHECK allowed
--    no payroll kind, so `payroll_run` inserts failed with 23514.
--    ACTIVE now: payroll_run (ONE row per paid period — the net amount).
--    Documented, NOT written yet (Phase 2): payslip_recorded, advance_paid,
--    advance_deducted. Never write payroll_run AND payslip_recorded for the
--    same period (double counting).
-- ---------------------------------------------------------------------------
alter table public.financial_transactions
  drop constraint if exists financial_transactions_event_type_check;
alter table public.financial_transactions
  add constraint financial_transactions_event_type_check
  check (event_type in ('invoice_issued', 'invoice_voided', 'payment_recorded',
                        'payment_voided', 'refund_recorded', 'write_off_recorded',
                        'expense_recorded', 'expense_voided',
                        'payroll_run', 'payslip_recorded',
                        'advance_paid', 'advance_deducted'));

comment on column public.financial_transactions.event_type is
  'Active (Phase A/B/C): invoice_issued, invoice_voided, payment_recorded, '
  'payment_voided, refund_recorded, write_off_recorded, expense_recorded, '
  'expense_voided. Payroll (20261012): payroll_run ACTIVE; payslip_recorded, '
  'advance_paid, advance_deducted documented and reserved for Phase 2. '
  'Future: cash_variance_recorded. Dictionary: docs/financial-ledger-kinds.md';

-- ---------------------------------------------------------------------------
-- 7) RLS. CONFLICT FIX (6): salaries are personal data — a plain clinic member
--    must NOT read colleagues' payslips. Policy = clinic admin (owner/manager)
--    OR the member themself (provider row linked to auth.uid()).
--    API access is FINANCE-gated anyway; this is the second layer.
-- ---------------------------------------------------------------------------
alter table public.payroll_periods enable row level security;
alter table public.payslips enable row level security;
alter table public.staff_advances enable row level security;
alter table public.payslip_adjustments enable row level security;

-- Aggregate period totals: admins only (super admin bypasses).
drop policy if exists "payroll_periods_admin" on public.payroll_periods;
create policy "payroll_periods_admin" on public.payroll_periods for all
  using (public.app_is_super_admin() or public.app_user_is_clinic_admin_safe(clinic_id))
  with check (public.app_is_super_admin() or public.app_user_is_clinic_admin_safe(clinic_id));

-- Payslips: admin OR the provider linked to the caller's own account.
drop policy if exists "payslips_admin_or_self" on public.payslips;
create policy "payslips_admin_or_self" on public.payslips for select
  using (
    public.app_is_super_admin()
    or public.app_user_is_clinic_admin_safe(clinic_id)
    or provider_id in (
      select p.id from public.providers p
      where p.clinic_id = payslips.clinic_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "payslips_admin_write" on public.payslips;
create policy "payslips_admin_write" on public.payslips for all
  using (public.app_is_super_admin() or public.app_user_is_clinic_admin_safe(clinic_id))
  with check (public.app_is_super_admin() or public.app_user_is_clinic_admin_safe(clinic_id));

-- Advances: same shape (own advances visible, admin manages all).
drop policy if exists "staff_advances_admin_or_self" on public.staff_advances;
create policy "staff_advances_admin_or_self" on public.staff_advances for select
  using (
    public.app_is_super_admin()
    or public.app_user_is_clinic_admin_safe(clinic_id)
    or provider_id in (
      select p.id from public.providers p
      where p.clinic_id = staff_advances.clinic_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "staff_advances_admin_write" on public.staff_advances;
create policy "staff_advances_admin_write" on public.staff_advances for all
  using (public.app_is_super_admin() or public.app_user_is_clinic_admin_safe(clinic_id))
  with check (public.app_is_super_admin() or public.app_user_is_clinic_admin_safe(clinic_id));

-- Bonuses/deductions are payroll internals: admins only.
drop policy if exists "payslip_adjustments_admin" on public.payslip_adjustments;
create policy "payslip_adjustments_admin" on public.payslip_adjustments for all
  using (public.app_is_super_admin() or public.app_user_is_clinic_admin_safe(clinic_id))
  with check (public.app_is_super_admin() or public.app_user_is_clinic_admin_safe(clinic_id));

-- ---------------------------------------------------------------------------
-- 8) API privileges — mandatory (the 42501 lesson from #38: a manually created
--    table without grants makes every PostgREST write fail).
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.payroll_periods to authenticated;
grant select, insert, update, delete on public.payslips to authenticated;
grant select, insert, update, delete on public.staff_advances to authenticated;
grant select, insert, update, delete on public.payslip_adjustments to authenticated;
grant all privileges on public.payroll_periods to service_role;
grant all privileges on public.payslips to service_role;
grant all privileges on public.staff_advances to service_role;
grant all privileges on public.payslip_adjustments to service_role;

commit;

-- ============================================================================
-- END — Payroll Engine Phase 1. No historical table was altered except the
-- documented ledger-kind CHECK (additive widening; no data touched).
-- Existing reports are unchanged on purpose: financial_period_summary and the
-- cash-flow views list their kinds explicitly, so `payroll_run` does NOT flow
-- into P&L/cash-flow until the owner approves that reporting change (D4).
-- ============================================================================

