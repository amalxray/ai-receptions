-- Create a platform-managed prospect list for clinics and imaging centers.
-- ROLLBACK: drop table if exists public.prospects;

CREATE TABLE IF NOT EXISTS public.prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_name text NOT NULL,
  doctor_name text,
  phone text,
  email text,
  website text,
  address text,
  city text NOT NULL,
  country text NOT NULL DEFAULT 'PS',
  source text NOT NULL CHECK (source IN ('openstreetmap', 'manual', 'referral')),
  source_id text,
  status text NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'contacted', 'replied', 'meeting', 'converted', 'rejected', 'archived')
  ),
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_prospects_city
  ON public.prospects (city);

CREATE INDEX IF NOT EXISTS idx_prospects_status
  ON public.prospects (status);

CREATE INDEX IF NOT EXISTS idx_prospects_created_at
  ON public.prospects (created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_prospects ON public.prospects;
CREATE TRIGGER set_updated_at_prospects
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.prospects FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.prospects TO service_role;
