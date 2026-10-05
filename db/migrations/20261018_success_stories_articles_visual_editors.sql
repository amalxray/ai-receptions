-- Additive fields for platform /ask success stories and article featured images.
-- Existing rows are preserved; all new fields are nullable for legacy content.
ALTER TABLE public.platform_stories
  ADD COLUMN IF NOT EXISTS before_image_url TEXT,
  ADD COLUMN IF NOT EXISTS after_image_url TEXT,
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS doctor_name TEXT,
  ADD COLUMN IF NOT EXISTS specialty TEXT;

ALTER TABLE public.platform_articles
  ADD COLUMN IF NOT EXISTS featured_image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_platform_stories_provider_id
  ON public.platform_stories(provider_id)
  WHERE provider_id IS NOT NULL;
