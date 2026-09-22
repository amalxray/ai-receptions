-- ============================================================================
-- 20261010_clinic_invitations.sql — TEAM INVITATIONS (#38)
--
-- PROBLEM: adding a team member required the person to ALREADY have an account
-- (POST /api/clinic/members resolves the email in auth.users and answers 404
-- otherwise). An owner could not invite someone by email.
--
-- FIX: an `invitations` table + an emailed link. The invitee opens the link,
-- sets a password (or signs in if the account already exists) and joins the
-- clinic with the invited role — no pre-existing account required.
--
-- SECURITY MODEL
--   * token = 32 random bytes (hex, 64 chars) generated server-side. It is a
--     bearer secret delivered ONLY to the invited mailbox and is never logged.
--   * The invitation is bound to `invited_email`: acceptance is refused unless
--     the authenticated/signup email matches (case-insensitive).
--   * Single use: status pending → accepted exactly once; pending invitations
--     expire after 7 days.
--   * RLS: clinic members may SELECT their clinic's invitations; only
--     owner/manager may INSERT/UPDATE/DELETE. Token lookups run in the API
--     route with the service-role client — an anon-client policy can never
--     expose an invitation row to somebody who does not hold the token.
--
-- IDEMPOTENT: safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ROLLBACK:
--   drop table if exists public.invitations cascade;
--   drop function if exists public.app_user_is_clinic_admin_safe(uuid);
-- ============================================================================

-- 1) Table -------------------------------------------------------------------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  invited_email text not null,
  role text not null default 'staff',
  token text not null,
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  invited_by uuid,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.invitations is
  'Team invitations (#38). status: pending | accepted | revoked | expired. token is a bearer secret — never log it.';

-- 2) Constraints (idempotent) ------------------------------------------------
-- Unique token: the lookup key of the acceptance flow.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invitations_token_key' and conrelid = 'public.invitations'::regclass
  ) then
    alter table public.invitations add constraint invitations_token_key unique (token);
  end if;
end;
$$;

-- Role must be a role the product understands (mirrors the clinic_user_role
-- enum values added by 20260921_subscription_foundation_fixes.sql).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invitations_role_check' and conrelid = 'public.invitations'::regclass
  ) then
    alter table public.invitations
      add constraint invitations_role_check
      check (role in ('owner', 'admin', 'manager', 'doctor', 'receptionist', 'accountant', 'staff', 'viewer'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invitations_status_check' and conrelid = 'public.invitations'::regclass
  ) then
    alter table public.invitations
      add constraint invitations_status_check
      check (status in ('pending', 'accepted', 'revoked', 'expired'));
  end if;
end;
$$;

-- invited_by / accepted_by point at auth.users. Added conditionally so the
-- migration also applies on a database without the auth schema (self-hosted).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users') then
    if not exists (
      select 1 from pg_constraint
      where conname = 'invitations_invited_by_fkey' and conrelid = 'public.invitations'::regclass
    ) then
      alter table public.invitations
        add constraint invitations_invited_by_fkey
        foreign key (invited_by) references auth.users(id) on delete set null;
    end if;
    if not exists (
      select 1 from pg_constraint
      where conname = 'invitations_accepted_by_fkey' and conrelid = 'public.invitations'::regclass
    ) then
      alter table public.invitations
        add constraint invitations_accepted_by_fkey
        foreign key (accepted_by) references auth.users(id) on delete set null;
    end if;
  end if;
end;
$$;

-- 3) Indexes -----------------------------------------------------------------
create index if not exists idx_invitations_token on public.invitations(token) where status = 'pending';
create index if not exists idx_invitations_email on public.invitations(invited_email) where status = 'pending';
create index if not exists idx_invitations_clinic_created on public.invitations(clinic_id, created_at desc);

-- At most ONE pending invitation per email per clinic (re-invite = revoke first),
-- so duplicates can never accumulate.
create unique index if not exists idx_invitations_pending_unique
  on public.invitations(clinic_id, lower(invited_email))
  where status = 'pending';

-- 4) updated_at trigger ------------------------------------------------------
drop trigger if exists set_updated_at_invitations on public.invitations;
create trigger set_updated_at_invitations
  before update on public.invitations
  for each row execute function public.set_updated_at();

-- 5) RLS helpers -------------------------------------------------------------
-- SECURITY DEFINER (same rationale as 20260816_fix_recursive_rls.sql): a policy
-- on `invitations` must read `clinic_users` WITHOUT re-entering RLS, otherwise
-- the policy recurses. Fixed search_path, no dynamic SQL, still bound to auth.uid().
create or replace function public.app_user_is_clinic_admin_safe(clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clinic_users cu
    where cu.clinic_id = clinic
      and cu.user_id = auth.uid()::uuid
      and cu.role in ('owner', 'manager')
      and cu.deleted_at is null
  );
$$;

-- 6) RLS ---------------------------------------------------------------------
alter table public.invitations enable row level security;

drop policy if exists "clinic_members_can_view_invitations" on public.invitations;
create policy "clinic_members_can_view_invitations"
  on public.invitations for select
  using (
    public.app_is_super_admin()
    or public.app_user_is_active_clinic_member_safe(clinic_id)
  );

drop policy if exists "clinic_admins_can_create_invitations" on public.invitations;
create policy "clinic_admins_can_create_invitations"
  on public.invitations for insert
  with check (
    public.app_is_super_admin()
    or public.app_user_is_clinic_admin_safe(clinic_id)
  );

-- Status transitions (revoke / expire) stay admin-only for the anon client.
-- The acceptance path runs with the service-role client (token holder only).
drop policy if exists "clinic_admins_can_update_invitations" on public.invitations;
create policy "clinic_admins_can_update_invitations"
  on public.invitations for update
  using (
    public.app_is_super_admin()
    or public.app_user_is_clinic_admin_safe(clinic_id)
  )
  with check (
    public.app_is_super_admin()
    or public.app_user_is_clinic_admin_safe(clinic_id)
  );

drop policy if exists "clinic_admins_can_delete_invitations" on public.invitations;
create policy "clinic_admins_can_delete_invitations"
  on public.invitations for delete
  using (
    public.app_is_super_admin()
    or public.app_user_is_clinic_admin_safe(clinic_id)
  );

