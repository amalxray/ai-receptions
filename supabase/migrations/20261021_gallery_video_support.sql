-- ============================================================
-- 20261021 — Gallery video support
--
-- Extends public.platform_gallery with an optional video URL and a
-- media_type discriminator so the admin gallery can manage both
-- images and videos in one table. Existing image rows keep
-- media_type = 'image' and NULL video_url.
-- ============================================================

ALTER TABLE public.platform_gallery
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'video'));

CREATE INDEX IF NOT EXISTS idx_gallery_media_type
  ON public.platform_gallery(media_type) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_gallery TO service_role;
