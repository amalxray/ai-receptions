-- ============================================================================
-- #43 follow-up — set_user_permissions must accept an EXPLICIT actor.
--
-- WHY (proven live, not assumed):
--   The 3-arg function from 20261011 authorized via
--   public.app_user_is_clinic_admin_safe(clinic), which reads auth.uid().
--   The API route calls it through the SERVICE-ROLE client (postgrest), where
--   the JWT carries role=service_role and NO `sub` claim → auth.uid() is NULL →
--   the guard raises 'Unauthorized' (verified: P0001 Unauthorized) → every save
--   failed with a generic 500 «تعذر حفظ الصلاحيات».
--
-- FIX: mirror the established accounting convention (record_expense(p_recorded_by)),
--   i.e. the server passes the authenticated actor it already verified via
--   authorizeClinicRequest, and the function authorizes THAT user id.
--
-- SECURITY: EXECUTE is granted to service_role ONLY. A `authenticated` client
--   must not be able to call this with a forged actor uuid (which would let any
--   member impersonate the clinic owner), so the grant from 20261011 is revoked
--   and the 3-arg variant is dropped. The API route is the only entry point.
-- ============================================================================
begin;

-- 1) Retire the auth.uid()-bound variant (nobody may call it directly).
drop function if exists public.set_user_permissions(uuid, uuid, jsonb);

-- 2) Actor-explicit, atomic replacement of one member's permission overrides.
create or replace function public.set_user_permissions(
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
  -- The actor must be an ACTIVE owner/manager of this clinic. Explicit id, so
  -- the check works identically under a user JWT and under service_role.
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

-- 3) Service-role only (no client-side impersonation surface).
revoke all on function public.set_user_permissions(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_user_permissions(uuid, uuid, uuid, jsonb)
  to service_role;

comment on function public.set_user_permissions(uuid, uuid, uuid, jsonb) is
  '#43 — replaces a member''s permission overrides atomically. '
  'p_actor_user_id must be an active owner/manager of p_clinic_id; the target '
  'must be an active, non-owner member. Callable by service_role only.';

commit;

-- ----------------------------------------------------------------------------
-- REVERSIBILITY (documented; NOT executed):
--   drop function if exists public.set_user_permissions(uuid, uuid, uuid, jsonb);
--   -- then re-apply 20261011_permissions_and_custom_roles.sql to restore the
--   -- previous auth.uid()-bound variant (which only works for user JWTs).
-- ----------------------------------------------------------------------------
