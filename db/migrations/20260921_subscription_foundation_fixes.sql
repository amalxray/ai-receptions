-- ============================================================================
-- 20260921_subscription_foundation_fixes.sql
-- SUBSCRIPTION FOUNDATION — FIX-5 + FIX-7.
--
-- Additive only. No destructive changes. Idempotent. Safe to re-run.
-- Never touches: billing_plans rows, subscriptions rows, plan_activity_caps rows,
--               entitlement_usage rows (continuity of live subscriptions is
--               preserved by construction — this file adds nothing that can
--               cascade).
--
-- FIX-5 — capability registry gap
--   public.activity_capabilities was seeded by 20260916 with four canonical
--   capability keys, but the live database only carried three of them:
--   `imaging_services_limit` was missing. The application registry
--   (lib/subscription/activityEntitlements.ts ACTIVITY_CAPABILITY_REGISTRY) and
--   the per-plan grants (public.plan_activity_caps, 20 rows) both DO include it,
--   and app/api/clinic/activity-catalog/route.ts enforces it fail-closed for
--   imaging_center tenants. Re-insert the missing registry row only.
--
-- FIX-7 — clinic_user_role enum gap
--   create type public.clinic_user_role as enum ('owner','admin','receptionist')
--   (20260721_initial_schema) never matched the roles the application already
--   writes/reads: 'staff', 'doctor', 'manager', 'accountant', 'viewer'.
--   ALTER TYPE ... ADD VALUE IF NOT EXISTS is additive (existing values and
--   existing rows are untouched; no row rewrite).
--
-- Rollback:
--   delete from public.activity_capabilities
--    where capability_key = 'imaging_services_limit';
--   -- enum values cannot be removed in PostgreSQL (by design).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FIX-5 — register the missing activity capability
-- ---------------------------------------------------------------------------
insert into public.activity_capabilities (capability_key, label, applies_to, standard_cap)
values ('imaging_services_limit', 'Imaging Services Limit', array['imaging_center']::activity_type[], false)
on conflict (capability_key) do nothing;

-- ---------------------------------------------------------------------------
-- FIX-7 — align the role enum with the roles the application actually uses
-- ---------------------------------------------------------------------------
alter type public.clinic_user_role add value if not exists 'staff';
alter type public.clinic_user_role add value if not exists 'doctor';
alter type public.clinic_user_role add value if not exists 'manager';
alter type public.clinic_user_role add value if not exists 'accountant';
alter type public.clinic_user_role add value if not exists 'viewer';
