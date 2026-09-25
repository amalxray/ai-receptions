-- ============================================================================
-- 20261019_fix_view_grants.sql — restore SELECT on the two reporting views.
--
-- WHY (live incident, 2026-09-25): 20261018 (satar 84/168) recreates
-- financial_period_summary and cash_flow_summary with `drop view` + `create
-- view`. `drop view` RESETS the ACL and `create view` does NOT restore it:
-- 20261018 re-applied the reloption security_invoker (with a guard) but shipped
-- no GRANT and no privilege guard. Production proof (service-role key):
--   receivable_aging 200 · daily_cash_positions 200 · payroll_periods 200 ·
--   financial_period_summary / cash_flow_summary →
--     403 {"code":"42501","message":"permission denied for view …"} (anon: 401)
-- → reporting.ts throws → API 500 → dashboard shows "خدمة الذكاء المالي غير متاحة".
--
-- PRIVILEGES ONLY: no view is dropped or recreated here (that is the cause),
-- and nothing else changes — the shape, `security_invoker=true` and the
-- PostgREST schema cache are already correct (the cache exposes
-- … net_result,payroll). The ONLY defect is the ACL.
--
-- WHO: service_role only — every consumer reads through supabaseAdmin
-- (lib/services/reporting.ts). `anon` is deliberately NOT granted: with
-- security_invoker=true the view also needs SELECT on the underlying
-- payroll_periods, which anon does not have (401) — the grant would only trade
-- one 42501 for another. `authenticated` (has payroll_periods since 20261012)
-- can be added the day a browser-side reader of these views appears.
--
-- Guarded: the 20261018 verification ran as the view OWNER, which is blind to
-- ACLs (it happily reported expenses = 5800) — that is why the outage shipped.
-- ============================================================================

begin;

-- 1) The missing GRANTs (idempotent — re-running is a no-op).
grant select on public.financial_period_summary to service_role;
grant select on public.cash_flow_summary       to service_role;

-- 2) Guard — verify the ACL (relacl), not the intention. A raise means `commit`
--    is never reached, so Postgres rolls the grants back (all-or-nothing).
do $$
declare
  v_rel text;
  v_ok  integer;
begin
  foreach v_rel in array array['financial_period_summary', 'cash_flow_summary'] loop
    select count(*) into v_ok
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      join pg_roles r on r.oid = a.grantee
     where n.nspname = 'public'
       and c.relname = v_rel
       and r.rolname = 'service_role'
       and a.privilege_type = 'SELECT';
    if v_ok = 0 then
      raise exception 'GRANT guard failed — service_role has no SELECT on public.%', v_rel;
    end if;
  end loop;
end $$;

-- Defensive, project convention (cf. 20261015/16/17). Privileges are evaluated
-- per query, so this incident class needs no reload to take effect.
notify pgrst, 'reload schema';

commit;

-- REVERSIBILITY (documented; NOT executed):
--   revoke select on public.financial_period_summary from service_role;
--   revoke select on public.cash_flow_summary       from service_role;
-- ============================================================================
-- END — view privileges restored. No schema, view, reloption, ledger row or
-- engine behaviour touched; 20261018 stays the untouched historical record.
-- ============================================================================
