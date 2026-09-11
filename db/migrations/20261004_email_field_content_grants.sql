-- ============================================================
-- 20261004 — content-table grants + clinics.email field
--  1) clinic content tables were SELECT-only for service_role → any
--     create/update from the dashboards failed with
--     `permission denied for table clinic_*`. Full CRUD grant here.
--  2) clinics gains an `email` column so the "الموقع الإلكتروني" field in
--     the setup manager becomes "البريد الإلكتروني" (the platform detail is
--     a contact email, not a marketing site). `website` is kept for
--     backwards compatibility.
-- ROLLBACK:
--   ALTER TABLE public.clinics DROP COLUMN IF EXISTS email;
--   REVOKE INSERT, UPDATE, DELETE ON public.clinic_articles FROM service_role; (…)
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_articles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_achievements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_testimonials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_news_ticker TO service_role;

ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS email text;