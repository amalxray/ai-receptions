-- Resumable upload identity and keyset pagination for private medical files.
-- This migration is review-only until explicitly applied by an operator.

alter table public.medical_upload_sessions
  add column if not exists client_upload_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'uq_medical_upload_session_client_upload'
       and conrelid = 'public.medical_upload_sessions'::regclass
  ) then
    alter table public.medical_upload_sessions
      add constraint uq_medical_upload_session_client_upload
      unique (clinic_id, client_upload_id);
  end if;
end
$$;

create index if not exists idx_medical_files_clinic_created_id
  on public.medical_files (clinic_id, created_at desc, id desc)
  where deleted_at is null;

create index if not exists idx_medical_files_clinic_patient_created_id
  on public.medical_files (clinic_id, patient_id, created_at desc, id desc)
  where deleted_at is null;

create table if not exists public.clinic_storage_limits (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  soft_limit_bytes bigint not null check (soft_limit_bytes > 0),
  warning_percent smallint not null default 80 check (warning_percent between 1 and 100),
  notification_email text,
  last_alert_sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.clinic_storage_usage_snapshots (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  total_bytes bigint not null default 0 check (total_bytes >= 0),
  object_count bigint not null default 0 check (object_count >= 0),
  unknown_size_object_count bigint not null default 0 check (unknown_size_object_count >= 0),
  measured_at timestamptz not null default now()
);

create table if not exists public.storage_project_usage_snapshots (
  id smallint primary key default 1 check (id = 1),
  total_bytes bigint not null default 0 check (total_bytes >= 0),
  object_count bigint not null default 0 check (object_count >= 0),
  unknown_size_object_count bigint not null default 0 check (unknown_size_object_count >= 0),
  unclassified_bytes bigint not null default 0 check (unclassified_bytes >= 0),
  unclassified_object_count bigint not null default 0 check (unclassified_object_count >= 0),
  measured_at timestamptz not null default now(),
  last_alert_sent_at timestamptz
);

alter table public.clinic_storage_limits enable row level security;
alter table public.clinic_storage_usage_snapshots enable row level security;
alter table public.storage_project_usage_snapshots enable row level security;

grant all on table public.clinic_storage_limits to service_role;
grant all on table public.clinic_storage_usage_snapshots to service_role;
grant all on table public.storage_project_usage_snapshots to service_role;

create or replace function public.can_upload_medical_storage_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.medical_upload_sessions s
    join public.patients p on p.id = s.patient_id
    where s.storage_path = object_name
      and s.status = 'started'
      and s.created_by = auth.uid()
      and s.expires_at > now()
      and p.id::text = split_part(object_name, '/', 3)
      and p.clinic_id::text = split_part(object_name, '/', 2)
      and split_part(object_name, '/', 1) = 'medical'
      and exists (
        select 1
        from public.clinic_users cu
        where cu.clinic_id = s.clinic_id
          and cu.user_id = auth.uid()
          and cu.deleted_at is null
      )
  );
$$;

revoke all on function public.can_upload_medical_storage_object(text) from public, anon;
grant execute on function public.can_upload_medical_storage_object(text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'medical_files_upload_from_owned_session'
  ) then
    create policy medical_files_upload_from_owned_session
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'medical-files'
        and public.can_upload_medical_storage_object(name)
      );
  end if;
end
$$;

create or replace function public.refresh_storage_usage_snapshots()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  drop table if exists pg_temp.storage_usage_scan;
  create temporary table storage_usage_scan on commit drop as
  with objects as (
    select
      so.bucket_id,
      so.name,
      case
        when coalesce(so.metadata ->> 'size', '') ~ '^[0-9]+$'
          then (so.metadata ->> 'size')::bigint
        else null::bigint
      end as size_bytes,
      case
        when split_part(so.name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(so.name, '/', 2)::uuid
        else null::uuid
      end as path_clinic_id,
      case
        when split_part(so.name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(so.name, '/', 3)::uuid
        else null::uuid
      end as path_patient_id
    from storage.objects so
  ),
  classified as (
    select
      o.size_bytes,
      case
        when o.bucket_id = 'medical-files'
          and split_part(o.name, '/', 1) = 'medical'
          and p.id is not null
          and p.clinic_id = o.path_clinic_id
          then p.clinic_id
        when o.bucket_id = 'medical-files'
          and split_part(o.name, '/', 1) = 'clinic'
          and split_part(o.name, '/', 3) = 'messaging'
          and owner_clinic.id is not null
          then owner_clinic.id
        when o.bucket_id = 'clinic-public-media'
          and split_part(o.name, '/', 1) = 'clinic'
          and owner_clinic.id is not null
          then owner_clinic.id
        else null::uuid
      end as owner_clinic_id,
      o.name
    from objects o
    left join public.patients p on p.id = o.path_patient_id
    left join public.clinics owner_clinic on owner_clinic.id = o.path_clinic_id
  )
  select size_bytes, owner_clinic_id from classified;

  with tenant_totals as (
    select
      owner_clinic_id,
      sum(size_bytes)::bigint as total_bytes,
      count(*)::bigint as object_count,
      count(*) filter (where size_bytes is null)::bigint as unknown_size_object_count
    from pg_temp.storage_usage_scan
    where owner_clinic_id is not null
    group by owner_clinic_id
  )
  insert into public.clinic_storage_usage_snapshots (
    clinic_id, total_bytes, object_count, unknown_size_object_count, measured_at
  )
  select c.id, coalesce(t.total_bytes, 0), coalesce(t.object_count, 0), coalesce(t.unknown_size_object_count, 0), now()
  from public.clinics c
  left join tenant_totals t on t.owner_clinic_id = c.id
  on conflict (clinic_id) do update
    set total_bytes = excluded.total_bytes,
        object_count = excluded.object_count,
    unknown_size_object_count = excluded.unknown_size_object_count,
        measured_at = excluded.measured_at;

  insert into public.storage_project_usage_snapshots (
    id, total_bytes, object_count, unknown_size_object_count,
    unclassified_bytes, unclassified_object_count, measured_at
  )
  select
    1,
    coalesce(sum(size_bytes), 0)::bigint,
    count(*)::bigint,
    count(*) filter (where size_bytes is null)::bigint,
    coalesce(sum(size_bytes) filter (where owner_clinic_id is null), 0)::bigint,
    count(*) filter (where owner_clinic_id is null)::bigint,
    now()
  from pg_temp.storage_usage_scan
  on conflict (id) do update
    set total_bytes = excluded.total_bytes,
        object_count = excluded.object_count,
    unknown_size_object_count = excluded.unknown_size_object_count,
        unclassified_bytes = excluded.unclassified_bytes,
        unclassified_object_count = excluded.unclassified_object_count,
        measured_at = excluded.measured_at;
end;
$$;

revoke all on function public.refresh_storage_usage_snapshots() from public, anon, authenticated;
grant execute on function public.refresh_storage_usage_snapshots() to service_role;

create or replace function public.prune_stale_medical_uploads()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.medical_upload_sessions
     set status = 'orphan', finalized_at = now()
   where status in ('started', 'uploaded')
     and coalesce(expires_at, created_at + interval '24 hours') < now();
$$;

revoke all on function public.prune_stale_medical_uploads() from public, anon, authenticated;
grant execute on function public.prune_stale_medical_uploads() to service_role;
