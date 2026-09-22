-- ============================================================================
-- #43 — Flexible permissions + custom roles + per-user overrides
--
-- Model (Global by Default):
--   effective = role_defaults(role)  ⊕  custom_role.permissions (role=name)
--                               ⊕  user_permissions overrides (per user)
--   owner is ALWAYS all-permissions and can never be restricted.
-- ============================================================================
begin;

-- 1) Per-user permission overrides -------------------------------------------
create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  permission_key text not null,
  enabled boolean not null,
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, clinic_id, permission_key)
);

create index if not exists idx_user_permissions_lookup
  on public.user_permissions (user_id, clinic_id);

-- 2) Clinic-defined custom roles ---------------------------------------------
create table if not exists public.custom_roles (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  description text,
  permissions jsonb not null default '[]'::jsonb,
  color text default '#10b981',
  is_system boolean default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (clinic_id, name)
);

create index if not exists idx_custom_roles_clinic on public.custom_roles (clinic_id);

-- 3) RLS ----------------------------------------------------------------------
alter table public.user_permissions enable row level security;
alter table public.custom_roles enable row level security;

drop policy if exists "view_permissions" on public.user_permissions;
create policy "view_permissions" on public.user_permissions for select
  using (
    public.app_is_super_admin()
    or user_id = auth.uid()
    or public.app_user_is_clinic_admin_safe(clinic_id)
  );

drop policy if exists "manage_permissions" on public.user_permissions;
create policy "manage_permissions" on public.user_permissions for all
  using (public.app_user_is_clinic_admin_safe(clinic_id))
  with check (public.app_user_is_clinic_admin_safe(clinic_id));

drop policy if exists "view_roles" on public.custom_roles;
create policy "view_roles" on public.custom_roles for select
  using (
    public.app_is_super_admin()
    or public.app_user_is_active_clinic_member_safe(clinic_id)
  );

drop policy if exists "manage_roles" on public.custom_roles;
create policy "manage_roles" on public.custom_roles for all
  using (public.app_user_is_clinic_admin_safe(clinic_id))
  with check (public.app_user_is_clinic_admin_safe(clinic_id));

-- 4) API privileges (same 42501 pitfall as #38 — grants are mandatory) --------
grant select, insert, update, delete on public.user_permissions to authenticated;
grant select, insert, update, delete on public.custom_roles to authenticated;
grant all privileges on public.user_permissions to service_role;
grant all privileges on public.custom_roles to service_role;

-- 5) Atomic save of a member's overrides (admin-only, SECURITY DEFINER) --------
create or replace function public.set_user_permissions(
  p_user_id uuid,
  p_clinic_id uuid,
  p_permissions jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if not public.app_user_is_clinic_admin_safe(p_clinic_id) then
    raise exception 'Unauthorized';
  end if;

  -- The target must be an ACTIVE member of the same clinic and not its owner
  -- (owner is untouchable by design).
  if exists (
    select 1 from public.clinic_users cu
    where cu.clinic_id = p_clinic_id
      and cu.user_id = p_user_id
      and cu.deleted_at is null
      and cu.role = 'owner'
  ) then
    raise exception 'CANNOT_MODIFY_OWNER';
  end if;

  delete from public.user_permissions
    where user_id = p_user_id and clinic_id = p_clinic_id;

  insert into public.user_permissions (user_id, clinic_id, permission_key, enabled, updated_by)
  select p_user_id, p_clinic_id, key, (value)::boolean, v_admin_id
  from jsonb_each_text(p_permissions);
end;
$$;

grant execute on function public.set_user_permissions(uuid, uuid, jsonb) to authenticated;

commit;
