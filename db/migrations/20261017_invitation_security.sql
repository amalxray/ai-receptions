-- ============================================================================
-- Invitation security — 24h links, 30-minute opening sessions, atomic
-- single-use acceptance, owner-only extensions.
--
-- WHY (the reported symptom): invitation links lived 7 days and nothing tracked
-- whether one was being used, so a link could be replayed and nobody could tell
-- an in-use invitation from a dead one. Every open/accept decision moves into
-- SECURITY DEFINER functions so the checks are atomic (row locks) instead of a
-- read-then-write dance in the API.
-- ============================================================================
begin;

-- 1) 24-hour default for NEW invitations (existing rows keep their own value).
alter table public.invitations
  alter column expires_at set default (now() + interval '24 hours');

-- 2) Opening-session + usage counters.
alter table public.invitations
  add column if not exists opened_at timestamptz,
  add column if not exists session_expires_at timestamptz,
  add column if not exists accept_count integer not null default 0,
  add column if not exists extend_count integer not null default 0;

-- 3) Single-use invariant.
--    BACKFILL FIRST: invitations accepted before this migration have
--    accept_count = 0 (the column was just added), which would violate the new
--    constraint and abort the migration — i.e. it would break live invitations.
update public.invitations
  set accept_count = 1
  where status = 'accepted' and accept_count = 0;

alter table public.invitations drop constraint if exists invitations_single_use;
alter table public.invitations
  add constraint invitations_single_use check (
    (status = 'pending' and accept_count = 0)
    or (status = 'accepted' and accept_count >= 1)
    or status in ('revoked', 'expired')
  );

-- 4) Finding what is about to expire (the cron sweeps this).
create index if not exists idx_invitations_expiring
  on public.invitations (expires_at)
  where status = 'pending';


-- 5) OPEN an invitation → starts/refreshes a 30-minute session.
--    Throws a stable code the API translates into Arabic + an HTTP status.
create or replace function public.open_invitation(p_token text)
returns table (
  id uuid,
  clinic_id uuid,
  invited_email text,
  role text,
  status text,
  session_valid_until timestamptz,
  was_reopened boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations;
  v_session timestamptz;
begin
  select * into v_inv from public.invitations i where i.token = p_token;
  if not found then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  if v_inv.status = 'accepted' then
    raise exception 'ALREADY_ACCEPTED';
  end if;
  if v_inv.status in ('revoked', 'expired') then
    raise exception 'INVITATION_INVALID';
  end if;
  if v_inv.expires_at <= now() then
    -- The API marks the row 'expired'; raising here rolls this transaction back,
    -- so a status write inside this function would be lost anyway.
    raise exception 'INVITATION_EXPIRED';
  end if;

  -- A live session is reused: reloading the page must not restart the clock.
  if v_inv.session_expires_at is not null and v_inv.session_expires_at > now() then
    return query select v_inv.id, v_inv.clinic_id, v_inv.invited_email, v_inv.role,
                        v_inv.status, v_inv.session_expires_at, true;
    return;
  end if;

  v_session := now() + interval '30 minutes';
  update public.invitations
     set session_expires_at = v_session,
         opened_at = coalesce(opened_at, now()),
         updated_at = now()
   where invitations.id = v_inv.id;

  return query select v_inv.id, v_inv.clinic_id, v_inv.invited_email, v_inv.role,
                      v_inv.status, v_session, false;
end;
$$;


-- 6) ACCEPT an invitation → atomic single-use consumption.
--    `for update` serializes two racing accepts: the loser sees ALREADY_ACCEPTED
--    and the API rolls its membership back.
create or replace function public.accept_invitation(p_token text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations;
  v_email text;
begin
  select * into v_inv
    from public.invitations i
   where i.token = p_token
   for update;

  if not found then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  if v_inv.status = 'accepted' then
    raise exception 'ALREADY_ACCEPTED';
  end if;
  if v_inv.status in ('revoked', 'expired') then
    raise exception 'INVITATION_INVALID';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED';
  end if;

  -- The invitation is bound to one mailbox: proving ownership of a DIFFERENT
  -- account must never consume it.
  select lower(u.email) into v_email from auth.users u where u.id = p_user_id;
  if v_email is null then
    raise exception 'USER_NOT_FOUND';
  end if;
  if v_email <> lower(v_inv.invited_email) then
    raise exception 'EMAIL_MISMATCH';
  end if;

  update public.invitations
     set status = 'accepted',
         accepted_by = p_user_id,
         accepted_at = now(),
         accept_count = accept_count + 1,
         session_expires_at = null,   -- single-use: the opening session dies here
         opened_at = coalesce(opened_at, now()),
         updated_at = now()
   where invitations.id = v_inv.id;
end;
$$;

-- 7) EXTEND an invitation (owner/manager, max 3 × 24h) — atomic: the actor check,
--    the counter guard and the write share one transaction.
create or replace function public.extend_invitation(
  p_invitation_id uuid,
  p_clinic_id uuid,
  p_actor_user_id uuid,
  p_hours integer default 24,
  p_max_extends integer default 3
)
returns table (id uuid, expires_at timestamptz, extend_count integer, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_inv public.invitations;
  v_base timestamptz;
  v_new_expiry timestamptz;
  v_count integer;
begin
  select exists (
    select 1 from public.clinic_users cu
     where cu.clinic_id = p_clinic_id
       and cu.user_id = p_actor_user_id
       and cu.role in ('owner', 'manager')
       and cu.deleted_at is null
  ) into v_is_admin;
  if not v_is_admin then
    raise exception 'Unauthorized';
  end if;

  select * into v_inv
    from public.invitations i
   where i.id = p_invitation_id
     and i.clinic_id = p_clinic_id
   for update;
  if not found then
    raise exception 'INVITATION_NOT_FOUND';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'NOT_PENDING';
  end if;

  v_count := coalesce(v_inv.extend_count, 0);
  if v_count >= p_max_extends then
    raise exception 'MAX_EXTENDS_REACHED';
  end if;

  -- Extend from whichever is later: the current expiry or now, so a lapsed row
  -- gets a full window instead of a timestamp in the past.
  v_base := greatest(v_inv.expires_at, now());
  v_new_expiry := v_base + make_interval(hours => p_hours);

  update public.invitations
     set expires_at = v_new_expiry,
         extend_count = v_count + 1,
         status = 'pending',
         updated_at = now()
   where invitations.id = v_inv.id;

  return query select v_inv.id, v_new_expiry, v_count + 1, 'pending'::text;
end;
$$;

-- 8) Expiry sweep (called by the cron route with the service role).
create or replace function public.expire_stale_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.invitations
       set status = 'expired', updated_at = now()
     where status = 'pending' and expires_at <= now()
     returning 1
  )
  select count(*) into v_count from expired;
  return coalesce(v_count, 0);
end;
$$;

-- 9) EXECUTE grants -----------------------------------------------------------
--    `anon` is deliberately NOT granted: the public preview goes through the
--    rate-limited Next.js API (service role), so an unauthenticated visitor can
--    never probe tokens straight against PostgREST.
revoke all on function public.open_invitation(text) from public, anon;
grant execute on function public.open_invitation(text) to authenticated, service_role;

revoke all on function public.accept_invitation(text, uuid) from public, anon, authenticated;
grant execute on function public.accept_invitation(text, uuid) to service_role;

revoke all on function public.extend_invitation(uuid, uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.extend_invitation(uuid, uuid, uuid, integer, integer) to service_role;

revoke all on function public.expire_stale_invitations() from public, anon, authenticated;
grant execute on function public.expire_stale_invitations() to service_role;

notify pgrst, 'reload schema';
commit;

-- ============================================================================
-- REVERSIBILITY (documented; NOT executed):
--   alter table public.invitations alter column expires_at set default (now() + interval '7 days');
--   alter table public.invitations drop constraint if exists invitations_single_use;
--   alter table public.invitations drop column if exists opened_at,
--     drop column if exists session_expires_at, drop column if exists accept_count,
--     drop column if exists extend_count;
--   drop function if exists public.open_invitation(text);
--   drop function if exists public.accept_invitation(text, uuid);
--   drop function if exists public.extend_invitation(uuid, uuid, uuid, integer, integer);
--   drop function if exists public.expire_stale_invitations();
-- ============================================================================
