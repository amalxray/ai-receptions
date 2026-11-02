begin;

create table if not exists public.ai_training_annotations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  medical_file_id uuid not null references public.medical_files(id) on delete restrict,
  image_url text not null,
  image_width integer not null check (image_width > 0),
  image_height integer not null check (image_height > 0),
  annotations jsonb not null check (jsonb_typeof(annotations) = 'array'),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_training_annotations_clinic_patient_created
  on public.ai_training_annotations (clinic_id, patient_id, created_at desc);
create index if not exists idx_ai_training_annotations_medical_file
  on public.ai_training_annotations (medical_file_id, created_at desc);

alter table public.ai_training_annotations enable row level security;

drop policy if exists ai_training_annotations_member_read
  on public.ai_training_annotations;
create policy ai_training_annotations_member_read
  on public.ai_training_annotations
  for select
  to authenticated
  using (public.app_user_is_active_clinic_member_safe(clinic_id));

revoke all on public.ai_training_annotations from public, anon, authenticated;
grant select on public.ai_training_annotations to authenticated;
grant select, insert on public.ai_training_annotations to service_role;

comment on table public.ai_training_annotations is
  'Clinic-scoped manual annotations for dental X-ray training review; signed URL query tokens are not stored.';

commit;

-- Rollback, only after confirming no required annotation records remain:
-- drop table if exists public.ai_training_annotations;
