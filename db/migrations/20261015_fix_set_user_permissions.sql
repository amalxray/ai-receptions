-- ============================================================================
-- #43 hotfix — make set_user_permissions(uuid, uuid, uuid, jsonb) REALLY EXIST.
--
-- WHY THIS FILE EXISTS (proven live against project ixlsrurenboseoelwixs, not assumed):
--   POST /api/clinic/team/<userId>/permissions kept answering
--   PERMISSIONS_MIGRATION_REQUIRED. Live probes through PostgREST:
--     * 4-arg call (p_actor_user_id, p_user_id, p_clinic_id, p_permissions)
--         → 404 PGRST202 "no matches were found in the schema cache"
--     * 3-arg call (p_user_id, p_clinic_id, p_permissions)
--         → 400 P0001 Unauthorized  ← the BODY of the OLD function executed
--   P0001 (not 42883) proves the old 3-arg function is still present AND
--   executable, i.e. 20261014's `drop function … (uuid, uuid, jsonb)` +
--   `create … (uuid, uuid, uuid, jsonb)` never took effect in this database.
--   It is NOT a PostgREST schema-cache problem: the cache was queryable and
--   listed 35 RPCs, and it resolved the 3-arg signature by name.
--
-- This migration is deliberately idempotent and self-verifying so it can be
-- pasted into the Supabase SQL editor as-is, whatever the current state is.
-- ============================================================================
begin;

-- 1) Remove EVERY known overload, in every signature the repo ever shipped.
drop function if exists public.set_user_permissions(uuid, uuid, jsonb);
drop function if exists public.set_user_permissions(uuid, uuid, uuid, jsonb);

-- 2) Create the actor-explicit variant (the only one the API calls).
--    NOT "create or replace": the function was just dropped, so this is a plain
--    create — if it fails, the transaction aborts loudly instead of silently
--    keeping an incompatible overload around.
create function public.set_user_permissions(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_clinic_id uuid,
  p_permissions jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_is_admin boolean;
begin
  -- The actor must be an ACTIVE owner/manager of this clinic. The id is passed
  -- explicitly because auth.uid() is NULL under the service-role client.
  select exists (
    select 1
    from public.clinic_users cu
    where cu.clinic_id = p_clinic_id
      and cu.user_id = p_actor_user_id
      and cu.role in ('owner', 'manager')
      and cu.deleted_at is null
  ) into v_actor_is_admin;

  if not v_actor_is_admin then
    raise exception 'Unauthorized';
  end if;

  -- The target must be an ACTIVE member of the same clinic...
  if not exists (
    select 1
    from public.clinic_users cu
    where cu.clinic_id = p_clinic_id
      and cu.user_id = p_user_id
      and cu.deleted_at is null
  ) then
    raise exception 'TARGET_NOT_MEMBER';
  end if;

  -- ...and never the owner (owner is untouchable by design).
  if exists (
    select 1
    from public.clinic_users cu
    where cu.clinic_id = p_clinic_id
      and cu.user_id = p_user_id
      and cu.role = 'owner'
  ) then
    raise exception 'CANNOT_MODIFY_OWNER';
  end if;

  delete from public.user_permissions
    where user_id = p_user_id and clinic_id = p_clinic_id;

  insert into public.user_permissions (user_id, clinic_id, permission_key, enabled, updated_by)
  select p_user_id, p_clinic_id, key, (value)::boolean, p_actor_user_id
  from jsonb_each_text(coalesce(p_permissions, '{}'::jsonb));
end;
$$;

-- 3) Privileges: the API route is the only entry point (service role), so a
--    `authenticated` client can never forge p_actor_user_id and impersonate an
--    admin. EXECUTE is granted to service_role, and additionally to
--    `authenticator` — the role PostgREST connects as — so the function is
--    always part of the introspected schema and can never be hidden from the
--    API surface by privilege narrowing.
revoke all on function public.set_user_permissions(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_user_permissions(uuid, uuid, uuid, jsonb)
  to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'grant execute on function public.set_user_permissions(uuid, uuid, uuid, jsonb) to authenticator';
  end if;
end;
$$;

comment on function public.set_user_permissions(uuid, uuid, uuid, jsonb) is
  '#43 — replaces a member''s permission overrides atomically. '
  'p_actor_user_id must be an active owner/manager of p_clinic_id; the target '
  'must be an active, non-owner member. Callable by the service role only.';

-- 4) Ask PostgREST to rebuild its schema cache for this connection pool.
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- SELF-VERIFICATION — the SQL editor shows the result of the LAST statement,
-- so this SELECT is the proof that the fix landed. Expect EXACTLY ONE row:
--    overloads = 1 | args = "p_actor_user_id uuid, p_user_id uuid,
--    p_clinic_id uuid, p_permissions jsonb" | service_can_execute = true
-- ============================================================================
select
  count(*) over () as overloads,
  p.proname,
  pg_get_function_arguments(p.oid) as args,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'set_user_permissions';
