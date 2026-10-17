-- ============================================================
-- 20261019 — Landing page schema sync for current editor code
--
-- This migration ensures the database matches the current App Router
-- landing-page editor contract used in lib/services/landingContent.ts:
--   - landing_page_content exists
--   - landing_page_order exists
--   - landing_page_content.is_visible exists
--   - landing_page_order.sort_order exists
--
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS and ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.landing_page_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_key TEXT NOT NULL UNIQUE,
    content JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.landing_page_content
    ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.landing_page_content
SET is_visible = TRUE
WHERE is_visible IS NULL;

ALTER TABLE public.landing_page_content ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.landing_page_order (
    section_key TEXT PRIMARY KEY,
    sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.landing_page_order
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE public.landing_page_order
SET sort_order = 0
WHERE sort_order IS NULL;

ALTER TABLE public.landing_page_order ENABLE ROW LEVEL SECURITY;

INSERT INTO public.landing_page_order (section_key, sort_order)
VALUES
    ('hero', 0),
    ('features', 1),
    ('for_doctors', 2),
    ('how_it_works', 3),
    ('compare', 4),
    ('faq', 5),
    ('testimonials', 6),
    ('urgency_bar', 7),
    ('seo', 8),
    ('colors', 9)
ON CONFLICT (section_key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_content TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_order TO service_role;

COMMIT;
