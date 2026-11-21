-- Atomically end the current compensation record and create its dated revision.
create or replace function public.revise_clinic_provider_compensation(
  p_clinic_id uuid,
  p_compensation_id uuid,
  p_effective_from date,
  p_commission_percent numeric,
  p_fixed_monthly_amount numeric,
  p_notes text default null
)
returns setof public.clinic_provider_compensations
language plpgsql
set search_path = public
as $$
declare
  v_current public.clinic_provider_compensations%rowtype;
  v_revision public.clinic_provider_compensations%rowtype;
begin
  if p_effective_from is null
     or extract(day from p_effective_from) <> 1 then
    raise exception 'COMPENSATION_EFFECTIVE_DATE_INVALID';
  end if;

  if p_effective_from <= date_trunc('month', current_date)::date then
    raise exception 'COMPENSATION_EFFECTIVE_DATE_MUST_BE_FUTURE';
  end if;

  select *
    into v_current
    from public.clinic_provider_compensations
   where clinic_id = p_clinic_id
     and id = p_compensation_id
     and status = 'active'
   for update;

  if not found then
    raise exception 'COMPENSATION_NOT_ACTIVE';
  end if;

  if p_effective_from <= v_current.effective_from then
    raise exception 'COMPENSATION_REVISION_DATE_NOT_AFTER_CURRENT';
  end if;

  update public.clinic_provider_compensations
     set status = 'ended',
         effective_to = p_effective_from - 1,
         updated_at = now()
   where clinic_id = p_clinic_id
     and id = p_compensation_id;

  insert into public.clinic_provider_compensations (
    clinic_id,
    provider_id,
    model,
    commission_percent,
    fixed_monthly_amount,
    attribution_base,
    effective_from,
    notes,
    status
  ) values (
    v_current.clinic_id,
    v_current.provider_id,
    v_current.model,
    p_commission_percent,
    p_fixed_monthly_amount,
    v_current.attribution_base,
    p_effective_from,
    coalesce(p_notes, v_current.notes),
    'active'
  )
  returning * into v_revision;

  return next v_revision;
end;
$$;

revoke all on function public.revise_clinic_provider_compensation(uuid, uuid, date, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.revise_clinic_provider_compensation(uuid, uuid, date, numeric, numeric, text)
  to service_role;
