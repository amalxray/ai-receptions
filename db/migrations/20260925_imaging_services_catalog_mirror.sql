-- ============================================================================
-- 20260925_imaging_services_catalog_mirror.sql
-- MIRROR the imaging center's imaging_services catalog into clinic_services.
--
-- clinic_services is the CANONICAL generic service table (imagingService.ts):
-- the referrals API validates service_id against the TARGET center's
-- clinic_services, and the partner-services dropdown reads the same table.
-- A service that exists only in imaging_services (e.g. "مفصل الفكين") never
-- appears in the referral dropdown and cannot be billed.
--
-- Additive + idempotent: only inserts catalog rows that are missing; never
-- touches prices/overrides that the center already configured.
-- ============================================================================

insert into public.clinic_services (clinic_id, name, description, duration_minutes, pricing_type, price_visible_to_patients, active)
select
  s.clinic_id,
  s.name,
  null,
  coalesce(s.duration_minutes, 15),
  'unspecified',
  true,
  true
from public.imaging_services s
join public.clinics c on c.id = s.clinic_id and c.activity_type = 'imaging_center'
where s.active = true
  and not exists (
    select 1 from public.clinic_services cs
    where cs.clinic_id = s.clinic_id
      and cs.name = s.name
      and cs.deleted_at is null
  );

-- ----------------------------------------------------------------------------
-- REVERSIBILITY (documented; NOT executed): delete the mirrored rows created
-- by this migration (pricing_type='unspecified' AND price IS NULL AND
-- price_visible_to_patients=true AND active=true AND matching imaging_services
-- by name) — or soft-delete them via the clinic UI.
-- ----------------------------------------------------------------------------
