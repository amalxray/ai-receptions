-- ============================================================
-- 20261007 — /ask platform data layer (Phase 1)
--
-- NEW tables: platform_cities, platform_gallery, platform_articles,
--   platform_stories, platform_tips, platform_faq, platform_ask_settings
--   (+ indexes + seed + grants).
-- Already existing from 20261005 (verified — not recreated):
--   clinics.latitude/longitude/city/area/address_detail/country/google_maps_url.
--   Spec's `address_line` maps to the existing `address_detail` column.
-- ROLLBACK:
--   DROP TABLE IF EXISTS platform_faq, platform_tips, platform_stories,
--     platform_ask_settings, platform_articles, platform_gallery,
--     platform_cities CASCADE;
-- ============================================================

-- 1.1 — clinic location indexes (columns already exist)
CREATE INDEX IF NOT EXISTS idx_clinics_location
  ON public.clinics(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clinics_city ON public.clinics(city);

-- 1.2 — platform cities (patient location picker)
CREATE TABLE IF NOT EXISTS public.platform_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL UNIQUE,
  name_en TEXT,
  country TEXT DEFAULT 'PS',
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.platform_cities (name_ar, name_en, latitude, longitude) VALUES
  ('نابلس', 'Nablus', 32.2211, 35.2544),
  ('رام الله', 'Ramallah', 31.9038, 35.2034),
  ('الخليل', 'Hebron', 31.5326, 35.0998),
  ('جنين', 'Jenin', 32.4615, 35.3008),
  ('طولكرم', 'Tulkarm', 32.3104, 35.0286),
  ('بيت لحم', 'Bethlehem', 31.7054, 35.2024),
  ('أريحا', 'Jericho', 31.8667, 35.4500),
  ('قلقيلية', 'Qalqilya', 32.1897, 34.9706),
  ('غزة', 'Gaza', 31.5017, 34.4668),
  ('بيت جالا', 'Beit Jala', 31.7156, 35.1875)
ON CONFLICT (name_ar) DO NOTHING;

-- 1.3 — platform gallery
CREATE TABLE IF NOT EXISTS public.platform_gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  category TEXT,
  tags TEXT[],
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gallery_category
  ON public.platform_gallery(category) WHERE is_active = true;

-- 1.4 — platform articles
CREATE TABLE IF NOT EXISTS public.platform_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  excerpt TEXT,
  content TEXT NOT NULL,
  featured_image_id UUID REFERENCES public.platform_gallery(id) ON DELETE SET NULL,
  category TEXT,
  tags TEXT[],
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_articles_status
  ON public.platform_articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_slug ON public.platform_articles(slug);

-- 1.5 — /ask settings (owner-editable key/value)
CREATE TABLE IF NOT EXISTS public.platform_ask_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.platform_ask_settings (key, value) VALUES
  ('hero', '{"title": "كيف يمكنني مساعدتك؟", "subtitle": "اكتب مشكلتك، وسأساعدك في العثور على أفضل طبيب أسنان قريب منك", "logo": "🦷", "assistant_name": "سنّي"}'::jsonb),
  ('colors', '{"primary": "#10B981", "secondary": "#0EA5E9", "heading": "#7C3AED", "warning": "#F59E0B"}'::jsonb),
  ('sections', '{"hero": true, "quick_questions": true, "tips": true, "articles": true, "stories": true, "fun_facts": true, "faq": true, "cta": true}'::jsonb),
  ('questions', '["ألم أسنان", "تنظيف", "تقويم", "زراعة", "تبييض", "طوارئ"]'::jsonb),
  ('search_config', '{"limit": 3, "sort": "distance", "radius_km": 50, "require_location": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 1.6 — stories / tips / faq
CREATE TABLE IF NOT EXISTS public.platform_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name TEXT NOT NULL,
  patient_age INTEGER,
  patient_city TEXT,
  content TEXT NOT NULL,
  image_url TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.platform_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  icon TEXT,
  category TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.platform_faq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.7 — grants (service-role-only access, same deny-by-default pattern)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_cities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_gallery TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_articles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_ask_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_stories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_tips TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_faq TO service_role;

-- RLS deny-by-default (direct anon/authenticated table access denied)
ALTER TABLE public.platform_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_ask_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_faq ENABLE ROW LEVEL SECURITY;
