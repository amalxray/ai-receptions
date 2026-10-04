-- ============================================================
-- 20261004 — Landing page section ordering
--
-- The page builder stores a visual order for landing-page sections without
-- mutating the JSON content schema used by landing_page_content.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.landing_page_order (
    section_key TEXT PRIMARY KEY,
    sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.landing_page_order ENABLE ROW LEVEL SECURITY;

-- Seed default order to keep the current public layout stable until the
-- admin visual order is saved.
INSERT INTO public.landing_page_order (section_key, sort_order)
SELECT v.section_key, v.sort_order
FROM (
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
) AS v(section_key, sort_order)
ON CONFLICT (section_key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_page_order TO service_role;
