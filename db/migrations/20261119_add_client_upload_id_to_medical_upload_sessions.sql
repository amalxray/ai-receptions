-- Narrow schema repair for resumable medical upload identity.
-- Manual application is required by the owner through the Supabase SQL Editor.
-- Target: Production project shadi-ai-solutions22 (ref ixlsrurenboseoelwixs).
-- Adds only client_upload_id to medical_upload_sessions and its per-clinic uniqueness rule.

begin;

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

commit;

-- Rollback plan (emergency only after application code no longer reads/writes this
-- column, and after confirming no non-NULL upload identities need to be retained):
-- begin;
-- alter table public.medical_upload_sessions
--   drop constraint if exists uq_medical_upload_session_client_upload;
-- alter table public.medical_upload_sessions
--   drop column if exists client_upload_id;
-- commit;
