begin;

create table if not exists public.medical_image_analyses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  medical_file_id uuid not null references public.medical_files(id) on delete restrict,
  model_version text not null,
  image_width integer not null check (image_width > 0),
  image_height integer not null check (image_height > 0),
  predictions jsonb not null check (jsonb_typeof(predictions) = 'array'),
  consent_version text not null,
  consent_confirmed_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_medical_image_analyses_clinic_patient_created
  on public.medical_image_analyses (clinic_id, patient_id, created_at desc);
create index if not exists idx_medical_image_analyses_medical_file
  on public.medical_image_analyses (medical_file_id, created_at desc);

alter table public.medical_image_analyses enable row level security;

drop policy if exists medical_image_analyses_member_read
  on public.medical_image_analyses;
create policy medical_image_analyses_member_read
  on public.medical_image_analyses
  for select
  to authenticated
  using (public.app_user_is_active_clinic_member_safe(clinic_id));

revoke all on public.medical_image_analyses from public, anon, authenticated;
grant select on public.medical_image_analyses to authenticated;
grant select, insert on public.medical_image_analyses to service_role;

comment on table public.medical_image_analyses is
  'Clinic-scoped, consent-audited AI analysis metadata. Source medical images are not stored here.';

commit;

-- Rollback, only after confirming no required analysis records remain:
-- drop table if exists public.medical_image_analyses;
