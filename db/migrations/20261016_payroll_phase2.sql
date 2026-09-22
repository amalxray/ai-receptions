-- ============================================================================
-- Payroll Phase 2 — installment advances + period unlock + payroll audit trail
--
-- Builds ON 20261012_payroll_engine.sql (Phase 1) — nothing from Phase 1 is
-- dropped or narrowed:
--   * the period state machine keeps every Phase 1 transition and adds the
--     audited unlock (finalized → draft, reason required) plus the totals
--     re-write that an unlock enables.
--   * `payroll_run` stays the ONE ledger row per paid period (no double booking).
-- ============================================================================
begin;

-- 1) Installment advances -----------------------------------------------------
-- A 6,000 advance repaid over 6 months is ONE staff_advances row: the monthly
-- amount is what payroll deducts, and staff_advance_deductions is the audit
-- trail of what was actually taken in each period.
alter table public.staff_advances
  add column if not exists installment_count integer not null default 1
    check (installment_count >= 1 and installment_count <= 12),
  add column if not exists installment_amount numeric(12,2)
    check (installment_amount is null or installment_amount > 0),
  add column if not exists months_paid integer not null default 0
    check (months_paid >= 0);

create table if not exists public.staff_advance_deductions (
  id uuid primary key default gen_random_uuid(),
  advance_id uuid not null references public.staff_advances(id) on delete cascade,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  deducted_at timestamptz not null default now(),
  -- One deduction per advance per period: re-approving can never double-take.
  unique (advance_id, payroll_period_id)
);

create index if not exists idx_advance_deductions_advance
  on public.staff_advance_deductions (advance_id);
create index if not exists idx_advance_deductions_period
  on public.staff_advance_deductions (payroll_period_id);
create index if not exists idx_advance_deductions_clinic
  on public.staff_advance_deductions (clinic_id, deducted_at desc);

-- 2) Period unlock ------------------------------------------------------------
alter table public.payroll_periods
  add column if not exists unlocked_at timestamptz,
  add column if not exists unlocked_by uuid references auth.users(id),
  add column if not exists unlock_reason text,
  add column if not exists unlock_count integer not null default 0;

-- 3) Payroll audit trail ------------------------------------------------------
-- Distinct from the generic audit log: this one is period-scoped and is what
-- the payroll UI shows, so a pay dispute can be reconstructed verbatim.
create table if not exists public.payroll_audit_log (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  payroll_period_id uuid references public.payroll_periods(id) on delete set null,
  action text not null,
  actor_user_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_payroll_audit_clinic
  on public.payroll_audit_log (clinic_id, created_at desc);
create index if not exists idx_payroll_audit_period
  on public.payroll_audit_log (payroll_period_id, created_at desc);


-- 4) RLS ----------------------------------------------------------------------
alter table public.staff_advance_deductions enable row level security;
alter table public.payroll_audit_log enable row level security;

-- Deductions follow the Phase 1 payslip posture: admins see all, a member sees
-- only the deductions of their own advances.
drop policy if exists "advance_deductions_admin_or_self" on public.staff_advance_deductions;
create policy "advance_deductions_admin_or_self" on public.staff_advance_deductions for select
  using (
    public.app_is_super_admin()
    or public.app_user_is_clinic_admin_safe(clinic_id)
    or advance_id in (
      select a.id from public.staff_advances a
      join public.providers p on p.id = a.provider_id
      where p.user_id = auth.uid()
    )
  );

drop policy if exists "advance_deductions_admin_write" on public.staff_advance_deductions;
create policy "advance_deductions_admin_write" on public.staff_advance_deductions for all
  using (public.app_is_super_admin() or public.app_user_is_clinic_admin_safe(clinic_id))
  with check (public.app_is_super_admin() or public.app_user_is_clinic_admin_safe(clinic_id));

-- The audit trail is admin-only (it names who did what to whose pay).
drop policy if exists "payroll_audit_admin" on public.payroll_audit_log;
create policy "payroll_audit_admin" on public.payroll_audit_log for all
  using (public.app_is_super_admin() or public.app_user_is_clinic_admin_safe(clinic_id))
  with check (public.app_is_super_admin() or public.app_user_is_clinic_admin_safe(clinic_id));

-- 5) Guard: Phase 1 rules + a narrowly-scoped unlock escape -------------------
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

  -- Totals are engine-owned and frozen once the period leaves draft — UNLESS
  -- this very statement is the unlock (unlocked_at moves forward).
  if old.status <> 'draft'
     and (
       new.total_base is distinct from old.total_base
       or new.total_commission is distinct from old.total_commission
       or new.total_bonuses is distinct from old.total_bonuses
       or new.total_deductions is distinct from old.total_deductions
       or new.total_advances is distinct from old.total_advances
       or new.total_net is distinct from old.total_net
     )
     and (new.unlocked_at is null or new.unlocked_at is not distinct from old.unlocked_at)
  then
    raise exception 'PAYROLL_PERIOD_LOCKED';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status in ('approved','cancelled') then null;
    elsif old.status = 'approved' and new.status in ('paid','cancelled') then null;
    -- Unlock: backwards only, and only with the reason the owner had to supply
    -- (the API enforces the actor; the DB enforces that a reason exists).
    elsif old.status in ('approved','paid')
          and new.status = 'draft'
          and coalesce(nullif(btrim(new.unlock_reason), ''), null) is not null then null;
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

-- 6) Deduction rows are an append-only trail while money is still movable:
--    writes and reversals are allowed until the period is PAID (or cancelled),
--    which is exactly when Phase 1 freezes advances for good. An unlock brings
--    the period back to draft, so the rows become editable again.
create or replace function public.staff_advance_deductions_guard()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' then
    select status into v_status from public.payroll_periods where id = old.payroll_period_id;
    if v_status in ('paid', 'cancelled') then
      raise exception 'ADVANCE_DEDUCTION_PERIOD_LOCKED';
    end if;
    return old;
  end if;

  select status into v_status from public.payroll_periods where id = new.payroll_period_id;
  if v_status is null then
    raise exception 'PAYROLL_PERIOD_NOT_FOUND';
  end if;
  if v_status in ('paid', 'cancelled') then
    raise exception 'ADVANCE_DEDUCTION_PERIOD_LOCKED';
  end if;
  return new;
end;
$$;

drop trigger if exists staff_advance_deductions_guard on public.staff_advance_deductions;
create trigger staff_advance_deductions_guard
  before insert or delete on public.staff_advance_deductions
  for each row execute function public.staff_advance_deductions_guard();

-- 7) API privileges — explicit GRANTs (the 42501 lesson from #38) -------------
grant select, insert, update, delete on public.staff_advance_deductions to authenticated;
grant select, insert, update, delete on public.payroll_audit_log to authenticated;
grant all privileges on public.staff_advance_deductions to service_role;
grant all privileges on public.payroll_audit_log to service_role;

notify pgrst, 'reload schema';
commit;

-- ============================================================================
-- REVERSIBILITY (documented; NOT executed):
--   drop table if exists public.payroll_audit_log;
--   drop table if exists public.staff_advance_deductions;
--   alter table public.staff_advances drop column if exists installment_count,
--     drop column if exists installment_amount, drop column if exists months_paid;
--   alter table public.payroll_periods drop column if exists unlocked_at,
--     drop column if exists unlocked_by, drop column if exists unlock_reason,
--     drop column if exists unlock_count;
--   -- then re-apply 20261012_payroll_engine.sql §5 to restore the Phase 1 guard
-- ============================================================================

