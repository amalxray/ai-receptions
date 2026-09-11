-- ============================================================================
-- 20260912_platform_admins.sql — Platform (super) admin foundation (P2)
-- ----------------------------------------------------------------------------
-- Adds a platform-level admin table SEPARATE from clinic tenants. Admin UI and
-- APIs (app/admin, app/api/admin) gate entirely on this table. Additive only:
-- no existing RLS is touched and no data is modified.
-- ============================================================================

create table if not exists platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'owner' check (role in ('owner', 'admin', 'viewer')),
  created_at timestamptz not null default now(),
  unique (user_id)
);

alter table platform_admins enable row level security;

create index if not exists idx_platform_admins_email on platform_admins (email);
create index if not exists idx_platform_admins_role on platform_admins (role);

comment on table platform_admins is
  'Platform operators (super admins), separate from clinic tenants.';

-- Additive policy: a signed-in user can read their OWN admin row (the admin
-- APIs run with the service role and bypass RLS; this only enables a benign
-- self-check in app code when needed).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'platform_admins'
      and policyname = 'platform_admins_select_own'
  ) then
    create policy platform_admins_select_own on platform_admins
      for select to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- Server (service_role) access for the admin APIs + seed/upsert.
grant all on table platform_admins to service_role;

-- Seed administrator (idempotent): root owner for the platform.
-- Guarded by the management/seed script; this migration only documents the
-- expected first admin (the script upserts with the CURRENT auth user id).