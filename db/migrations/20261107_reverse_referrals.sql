create table if not exists public.reverse_referrals (
  id uuid primary key default gen_random_uuid(),
  from_clinic_id uuid not null references public.clinics(id) on delete cascade,
  to_clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id_to uuid not null references public.patients(id) on delete cascade,
  patient_name text not null,
  patient_phone text,
  medical_file_id uuid not null references public.medical_files(id) on delete cascade,
  image_url text not null,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint reverse_referrals_no_self check (from_clinic_id <> to_clinic_id)
);

create index if not exists idx_reverse_referrals_recipient
  on public.reverse_referrals (to_clinic_id, created_at desc);
create index if not exists idx_reverse_referrals_sender
  on public.reverse_referrals (from_clinic_id, created_at desc);

comment on column public.reverse_referrals.image_url is
  'Storage path in the private medical-files bucket; clients receive short-lived signed URLs from the API.';

alter table public.reverse_referrals enable row level security;

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
