alter table public.reverse_referrals
  add column if not exists from_patient_name text,
  add column if not exists from_patient_phone text;

alter table public.reverse_referrals
  alter column patient_id_to drop not null;

alter table public.reverse_referrals
  alter column patient_name drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reverse_referrals_accepted_has_patient'
      and conrelid = 'public.reverse_referrals'::regclass
  ) then
    alter table public.reverse_referrals
      add constraint reverse_referrals_accepted_has_patient
      check (status <> 'accepted' or patient_id_to is not null);
  end if;
end $$;

comment on column public.reverse_referrals.from_patient_name is
  'Patient name supplied by the imaging center; matched only by the recipient clinic when accepting.';
comment on column public.reverse_referrals.from_patient_phone is
  'Patient phone supplied by the imaging center; matched only by the recipient clinic when accepting.';
comment on column public.reverse_referrals.patient_name is
  'Legacy recipient patient data; do not expose to the sending imaging center.';
comment on column public.reverse_referrals.patient_phone is
  'Legacy recipient patient data; do not expose to the sending imaging center.';

alter table public.reverse_referrals enable row level security;

drop policy if exists reverse_referrals_select_sender on public.reverse_referrals;
drop policy if exists reverse_referrals_select_recipient on public.reverse_referrals;
create policy reverse_referrals_select_recipient
  on public.reverse_referrals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.clinic_users cu
      where cu.clinic_id = reverse_referrals.to_clinic_id
        and cu.user_id = auth.uid()
        and cu.deleted_at is null
    )
  );
