-- ============================================================
-- 20261005 — Landing page visibility toggles
--
-- Each CMS-backed section can be hidden independently while preserving its
-- saved content and ordering. The default is visible for existing rows.
-- ============================================================

ALTER TABLE public.landing_page_content
    ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.landing_page_content
SET is_visible = TRUE
WHERE is_visible IS NULL;

CREATE INDEX IF NOT EXISTS idx_landing_page_content_is_visible
    ON public.landing_page_content (is_visible);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_content TO service_role;
