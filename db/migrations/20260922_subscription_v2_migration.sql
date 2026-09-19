-- ============================================================================
-- 20260922_subscription_v2_migration.sql
-- SUBSCRIPTION V2 — 4-tier USD catalog (monthly + yearly) + safe migration.
--
-- ⚠️ WHY THIS FILE DOES NOT RENAME plan_id (the original draft did, and it cannot work)
--   The only FK referencing billing_plans(plan_id) is:
--     plan_activity_caps_plan_id_fkey
--       on_update = NO ACTION   ← PostgreSQL REJECTS any UPDATE of billing_plans.plan_id
--       on_delete = CASCADE     ← a DELETE would silently destroy the cap grants
--   (measured live by scripts/audit-subs.mjs). Therefore:
--     * new tiers are INSERTed as NEW rows (the PK is never mutated),
--     * `starter` is NOT renamed to `limited` — `limited` is a new row and
--       `starter` is hidden with is_active = false,
--     * `pro` is NOT renamed nor deleted — its subscriptions move to `center`
--       first, then the row is hidden. Nothing is ever DELETEd, so no
--       plan_activity_caps row is cascaded away.
--
-- ⚠️ plan_activity_caps rows are MANDATORY for every new plan id
--   Activity caps are fail-closed: a plan with NO row for (plan, activity,
--   capability) is DENIED. The original draft omitted them, which would have left
--   imaging_center / dental_lab tenants unable to add services on the new tiers.
--   PHASE B seeds them for all 5 new plan ids.
--
-- ⚠️ founding is NOT deletable
--   Two live subscriptions sit on it (amal-x-ray-center, hala-clinic). It is a
--   grandfathered tier: is_active stays TRUE, only is_public flips to false.
--
-- Live subscriptions after this migration (never downgraded below consumption —
-- measured: amal-x-ray 15 patients, hala 9 patients, 1 user each):
--   pro      (amal-clinic)        -> center   (owner decision: explicit mapping)
--   founding (amal-x-ray-center)  -> founding (unchanged, legacy grandfathered)
--   founding (hala-clinic)        -> founding (unchanged, legacy grandfathered)
--   no row   (ahmad / alawael)    -> stay on the code fallback
--
-- Idempotent. Additive. No DELETE anywhere. Rollback at the bottom.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PHASE A — additive catalog rows (never mutates an existing primary key)
-- ---------------------------------------------------------------------------


-- A.1 free_trial: 30-day trial (was 14) + refreshed USD limits/features.
--     Matrix: 100 AI messages, 50 bookings, 50 patients, 2 providers, 2 users.
update public.billing_plans set
  name = 'تجريبي',
  name_en = 'Trial',
  currency = 'usd',
  price_per_month = 0,
  billing_interval = 'trial',
  trial_days = 30,
  is_active = true,
  is_public = true,
  display_order = 0,
  stripe_price_id = null,
  features = '["تجربة 30 يوماً", "كل ميزات المتقدمة", "حتى 50 مريضاً", "100 محادثة AI شهرياً", "بدون بطاقة"]'::jsonb,
  limits = '{"ai_messages": 100, "bookings": 50, "patients": 50, "providers": 2, "users": 2, "knowledge_docs": 5, "conversations": null}'::jsonb,
  metadata = jsonb_build_object('tier', 'trial', 'post_trial_plan', 'limited')
where plan_id = 'free_trial';

-- A.2 sold tiers: basic / advanced / center + their yearly equivalents,
--     plus `limited` (post-trial fallback; is_public = false, never offered).
insert into public.billing_plans
  (plan_id, name, name_en, currency, price_per_month, billing_interval, trial_days,
   stripe_price_id, is_active, is_public, display_order, features, limits, metadata)
values
  ('basic', 'أساسية', 'Basic', 'usd', 3900, 'month', null,
   'price_1UHUbIPqB6gWlT7hNesJMdMY', true, true, 5,
   '["عيادة واحدة", "حتى 500 مريض", "مستخدم واحد", "محادثات AI غير محدودة"]'::jsonb,
   '{"ai_messages": null, "bookings": null, "patients": 500, "providers": 1, "users": 1, "knowledge_docs": null, "conversations": null}'::jsonb,
   '{"tier": "basic", "legacy_equivalent": "starter"}'::jsonb),

  ('advanced', 'متقدمة', 'Advanced', 'usd', 6900, 'month', null,
   'price_1UHUbKPqB6gWlT7h3L15z9tJ', true, true, 6,
   '["عيادات متعددة", "مرضى غير محدود", "4 مستخدمين", "فواتير ومدفوعات", "واتساب", "إدارة فريق", "تقارير"]'::jsonb,
   '{"ai_messages": null, "bookings": null, "patients": null, "providers": 4, "users": 4, "knowledge_docs": null, "conversations": null}'::jsonb,
   '{"tier": "advanced", "legacy_equivalent": "growth"}'::jsonb),

  ('center', 'مركز', 'Center', 'usd', 11900, 'month', null,
   'price_1UHUbLPqB6gWlT7hXAj9Qkem', true, true, 7,
   '["عيادات غير محدودة", "10 مستخدمين", "قبل/بعد Gallery", "شارات إنجازات", "تحليلات متقدمة", "أولوية الدعم"]'::jsonb,
   '{"ai_messages": null, "bookings": null, "patients": null, "providers": 10, "users": 10, "knowledge_docs": null, "conversations": null}'::jsonb,
   '{"tier": "center", "legacy_equivalent": "pro"}'::jsonb),

  ('limited', 'محدودة', 'Limited', 'usd', 0, 'month', null,
   null, true, false, 4,
   '["5 مرضى", "10 محادثات AI شهرياً", "ميزات أساسية فقط"]'::jsonb,
   '{"ai_messages": 10, "bookings": 50, "patients": 5, "providers": 2, "users": 2, "knowledge_docs": 3, "conversations": null}'::jsonb,
   '{"tier": "limited", "legacy_equivalent": "starter", "role": "post_trial_and_fallback"}'::jsonb),

  ('basic_yearly', 'أساسية سنوي', 'Basic Yearly', 'usd', 39900, 'year', null,
   'price_1UHUbIPqB6gWlT7hAD0oxmql', true, true, 8,
   '["كل ميزات الأساسية", "شهران مجاناً"]'::jsonb,
   '{"ai_messages": null, "bookings": null, "patients": 500, "providers": 1, "users": 1, "knowledge_docs": null, "conversations": null}'::jsonb,
   '{"tier": "basic", "billing_period": "yearly", "base_plan": "basic"}'::jsonb),

  ('advanced_yearly', 'متقدمة سنوي', 'Advanced Yearly', 'usd', 69900, 'year', null,
   'price_1UHUbKPqB6gWlT7hpJxLwll8', true, true, 9,
   '["كل ميزات المتقدمة", "شهران مجاناً"]'::jsonb,
   '{"ai_messages": null, "bookings": null, "patients": null, "providers": 4, "users": 4, "knowledge_docs": null, "conversations": null}'::jsonb,
   '{"tier": "advanced", "billing_period": "yearly", "base_plan": "advanced"}'::jsonb),

  ('center_yearly', 'مركز سنوي', 'Center Yearly', 'usd', 119900, 'year', null,
   'price_1UHUbMPqB6gWlT7huHcbwK1M', true, true, 10,
   '["كل ميزات المركز", "شهران مجاناً"]'::jsonb,
   '{"ai_messages": null, "bookings": null, "patients": null, "providers": 10, "users": 10, "knowledge_docs": null, "conversations": null}'::jsonb,
   '{"tier": "center", "billing_period": "yearly", "base_plan": "center"}'::jsonb)
on conflict (plan_id) do nothing;

-- A.3 founding — legacy grandfathered seat. is_active STAYS true (two live
--     subscriptions depend on it); only hidden from the public catalog and
--     normalised to USD so its displayed price never mixes currencies.
update public.billing_plans
   set is_public = false,
       currency = 'usd',
       price_per_month = 5000,
       metadata = coalesce(metadata, '{}'::jsonb) || '{"legacy": true, "grandfathered": true}'::jsonb
 where plan_id = 'founding';

-- A.4 starter / growth / pro — hidden legacy rows (kept for FK + history).
--     NEVER deleted: deleting `pro` would leave amal-clinic with an unknown
--     plan id, and deleting `founding` would cascade-delete 4 cap rows.
update public.billing_plans
   set is_active = false,
       is_public = false,
       metadata = coalesce(metadata, '{}'::jsonb) ||
                  jsonb_build_object('legacy', true, 'superseded_by',
                    case plan_id when 'starter' then 'limited'
                                 when 'growth'  then 'advanced'
                                 when 'pro'     then 'center' end)
 where plan_id in ('starter', 'growth', 'pro');

-- ---------------------------------------------------------------------------
-- PHASE B — activity caps for every new plan id (fail-closed otherwise)
--   Mirrors the grants of the tier each plan supersedes:
--     basic            <- starter (imaging 3 / 50 requests;   lab 5 / 30 cases)
--     advanced         <- growth  (imaging 10 / 200 requests; lab 15 / 100 cases)
--     center           <- pro     (unlimited, explicit NULL grant)
--     limited          <- starter
--     *_yearly         <- same as their monthly base tier
--   `founding` already carries its 4 rows (A.3 only hides it) — untouched.
-- ---------------------------------------------------------------------------
insert into public.plan_activity_caps (plan_id, activity_type, capability_key, limit_value) values
  ('basic',           'imaging_center', 'imaging_services_limit', 3),
  ('basic',           'imaging_center', 'imaging_requests_limit', 50),
  ('basic',           'dental_lab',     'lab_services_limit', 5),
  ('basic',           'dental_lab',     'lab_cases_limit', 30),

  ('advanced',        'imaging_center', 'imaging_services_limit', 10),
  ('advanced',        'imaging_center', 'imaging_requests_limit', 200),
  ('advanced',        'dental_lab',     'lab_services_limit', 15),
  ('advanced',        'dental_lab',     'lab_cases_limit', 100),

  ('center',          'imaging_center', 'imaging_services_limit', null),
  ('center',          'imaging_center', 'imaging_requests_limit', null),
  ('center',          'dental_lab',     'lab_services_limit', null),
  ('center',          'dental_lab',     'lab_cases_limit', null),

  ('limited',         'imaging_center', 'imaging_services_limit', 3),
  ('limited',         'imaging_center', 'imaging_requests_limit', 50),
  ('limited',         'dental_lab',     'lab_services_limit', 5),
  ('limited',         'dental_lab',     'lab_cases_limit', 30),

  ('basic_yearly',    'imaging_center', 'imaging_services_limit', 3),
  ('basic_yearly',    'imaging_center', 'imaging_requests_limit', 50),
  ('basic_yearly',    'dental_lab',     'lab_services_limit', 5),
  ('basic_yearly',    'dental_lab',     'lab_cases_limit', 30),

  ('advanced_yearly', 'imaging_center', 'imaging_services_limit', 10),
  ('advanced_yearly', 'imaging_center', 'imaging_requests_limit', 200),
  ('advanced_yearly', 'dental_lab',     'lab_services_limit', 15),
  ('advanced_yearly', 'dental_lab',     'lab_cases_limit', 100),

  ('center_yearly',   'imaging_center', 'imaging_services_limit', null),
  ('center_yearly',   'imaging_center', 'imaging_requests_limit', null),
  ('center_yearly',   'dental_lab',     'lab_services_limit', null),
  ('center_yearly',   'dental_lab',     'lab_cases_limit', null)
on conflict (plan_id, activity_type, capability_key) do nothing;


-- ---------------------------------------------------------------------------
-- PHASE C — move the live subscriptions onto the v2 catalog
--   Only `pro` has an approved successor (center). `founding` rows are left
--   exactly as they are: they are grandfathered and priced for life.
--   No row is ever deleted and no entitlement drops below what a clinic
--   already consumes (center = unlimited).
-- ---------------------------------------------------------------------------
update public.subscriptions
   set plan_id = 'center',
       billing_status = case when billing_status = 'yearly' then 'yearly' else 'monthly' end
 where plan_id = 'pro';

-- Safety assertion (fails loudly instead of silently degrading a tenant):
-- every live subscription must resolve to an ACTIVE billing plan.
do $$
declare bad_count int;
begin
  select count(*) into bad_count
    from public.subscriptions s
    left join public.billing_plans b
      on b.plan_id = s.plan_id and b.is_active = true
   where s.deleted_at is null and b.plan_id is null;

  if bad_count > 0 then
    raise exception 'subscription_v2: % live subscription(s) point at a non-active plan', bad_count;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PHASE D — verification helpers (read-only; safe to re-run)
--   select plan_id, name, currency, price_per_month, billing_interval, is_active,
--          is_public, display_order
--     from public.billing_plans order by display_order;
--   select plan_id, count(*) from public.plan_activity_caps group by 1 order by 1;
--   select clinic_id, plan_id, status from public.subscriptions
--    where deleted_at is null;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ROLLBACK
--   -- 1) put subscriptions back (only if center was reached from pro)
--   update public.subscriptions set plan_id = 'pro' where plan_id = 'center'
--     and clinic_id in (select id from public.clinics where slug = 'amal-clinic');
--   -- 2) un-hide the legacy rows
--   update public.billing_plans set is_active = true, is_public = true
--    where plan_id in ('starter', 'growth', 'pro');
--   -- 3) drop the v2 rows (their cap rows cascade — intended on rollback)
--   delete from public.billing_plans
--    where plan_id in ('basic', 'advanced', 'center', 'limited',
--                      'basic_yearly', 'advanced_yearly', 'center_yearly');
--   -- 4) free_trial back to the 14-day ILS shape
--   update public.billing_plans set trial_days = 14, currency = 'ils'
--    where plan_id = 'free_trial';
-- ============================================================================

