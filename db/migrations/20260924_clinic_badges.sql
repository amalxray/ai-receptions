-- PHASE 5 — verifiable achievement badges (certifications, awards, memberships).
-- icon_url/verify_url are owner-provided https links; rendering is text/link
-- only on the public page (no raw HTML), so there is no injection surface.
CREATE TABLE IF NOT EXISTS public.clinic_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('certification', 'award', 'membership', 'achievement')),
  title TEXT NOT NULL,
  issuer TEXT,
  year INTEGER,
  icon_url TEXT,
  verify_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_badges_clinic
  ON public.clinic_badges(clinic_id, enabled, display_order);
ALTER TABLE public.clinic_badges ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_badges TO service_role;