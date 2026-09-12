-- ============================================================
-- 20261005 — clinic location fields for /ask nearby search (Phase 1)
--
-- Already existing (verified before writing this migration — NOT recreated):
--   clinics.latitude NUMERIC, clinics.longitude NUMERIC,
--   clinics.city TEXT, clinics.area TEXT, clinics.address_detail TEXT
-- Added here:
--   country      TEXT DEFAULT 'PS'
--   google_maps_url TEXT
-- `address_line` from the spec maps to the existing `address_detail`
-- column (no duplicate column created).
--
-- Grants on clinics are already full for service_role (re-asserted below
-- so future environments converge to the same state).
-- ROLLBACK:
--   ALTER TABLE public.clinics DROP COLUMN IF EXISTS google_maps_url;
--   ALTER TABLE public.clinics DROP COLUMN IF EXISTS country;
-- ============================================================

ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'PS';
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS google_maps_url TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO service_role;

-- ============================================================
-- SEED — approximate Nablus coordinates for existing clinics.
-- The owner will refine these from the LocationPicker (Phase 2).
-- ============================================================
UPDATE public.clinics SET latitude = 32.2211, longitude = 35.2549
 WHERE slug = 'amal-x-ray-center' AND latitude IS NULL;
UPDATE public.clinics SET latitude = 32.2252, longitude = 35.2603
 WHERE slug = 'hala-clinic' AND latitude IS NULL;
UPDATE public.clinics SET latitude = 32.2296, longitude = 35.2665
 WHERE slug = 'amal-clinic' AND latitude IS NULL;
UPDATE public.clinics SET city = COALESCE(city, 'نابلس'), country = COALESCE(country, 'PS')
 WHERE slug IN ('amal-x-ray-center', 'hala-clinic', 'amal-clinic');