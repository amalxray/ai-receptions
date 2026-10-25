-- Track clinic access state separately from the billing subscription lifecycle.
-- `cancelled` remains writable until the paid period ends; `frozen` is read-only.

alter table public.clinics
  add column if not exists subscription_status text;

update public.clinics
set subscription_status = 'active'
where subscription_status is null;

alter table public.clinics
  alter column subscription_status set default 'active',
  alter column subscription_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinics_subscription_status_check'
      and conrelid = 'public.clinics'::regclass
  ) then
    alter table public.clinics
      add constraint clinics_subscription_status_check
      check (subscription_status in ('active', 'cancelled', 'frozen'));
  end if;
end
$$;

alter table public.subscriptions
  add column if not exists cancelled_at timestamptz;

create or replace function public.reject_frozen_clinic_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clinic_status text;
begin
  select c.subscription_status
    into clinic_status
    from public.clinics as c
   where c.id = new.clinic_id;

  if clinic_status = 'frozen' then
    raise exception 'clinic account is frozen; inserts are disabled'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function public.reject_frozen_clinic_insert() from public;

drop trigger if exists appointments_reject_frozen_clinic_insert on public.appointments;
create trigger appointments_reject_frozen_clinic_insert
  before insert on public.appointments
  for each row execute function public.reject_frozen_clinic_insert();

drop trigger if exists patients_reject_frozen_clinic_insert on public.patients;
create trigger patients_reject_frozen_clinic_insert
  before insert on public.patients
  for each row execute function public.reject_frozen_clinic_insert();

-- Block new clinic media and medical-file objects at the Storage metadata layer.
-- Existing files remain readable and are not altered or removed.
create or replace function public.reject_frozen_clinic_storage_upload()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clinic_id_text text;
  clinic_status text;
begin
  if new.bucket_id = 'clinic-public-media'
     and split_part(new.name, '/', 1) = 'clinic' then
    clinic_id_text := split_part(new.name, '/', 2);
  elsif new.bucket_id = 'medical-files'
     and split_part(new.name, '/', 1) = 'medical' then
    clinic_id_text := split_part(new.name, '/', 2);
  else
    return new;
  end if;

  if clinic_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return new;
  end if;

  select c.subscription_status
    into clinic_status
    from public.clinics as c
   where c.id = clinic_id_text::uuid;

  if clinic_status = 'frozen' then
    raise exception 'clinic account is frozen; storage uploads are disabled'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function public.reject_frozen_clinic_storage_upload() from public;

drop trigger if exists storage_objects_reject_frozen_clinic_upload on storage.objects;
create trigger storage_objects_reject_frozen_clinic_upload
  before insert on storage.objects
  for each row execute function public.reject_frozen_clinic_storage_upload();

-- The existing Stripe webhook updates subscriptions to canceled when the
-- scheduled period ends. Freeze the associated clinic only once its recorded
-- current_period_end has passed, so scheduling cancellation keeps the account
-- usable through the paid period.
create or replace function public.freeze_clinic_after_subscription_period()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status::text = 'canceled'
     and coalesce(new.cancel_at_period_end, false)
     and new.current_period_end is not null
     and new.current_period_end <= clock_timestamp() then
    update public.clinics
       set subscription_status = 'frozen',
           updated_at = clock_timestamp()
     where id = new.clinic_id
       and subscription_status <> 'frozen';
  end if;

  return new;
end;
$$;

revoke all on function public.freeze_clinic_after_subscription_period() from public;

drop trigger if exists subscriptions_freeze_clinic_after_period on public.subscriptions;
create trigger subscriptions_freeze_clinic_after_period
  after insert or update on public.subscriptions
  for each row execute function public.freeze_clinic_after_subscription_period();
