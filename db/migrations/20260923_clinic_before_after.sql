-- PHASE 4 — before/after case gallery (tenant-scoped, consent-gated).
-- Images live in the existing `clinic-public-media` storage bucket under
-- `clinic/{clinicId}/before-after/...`; this table keeps metadata only.
-- patient_consent is ENFORCED at the service layer (refuse to save without it).
CREATE TABLE IF NOT EXISTS public.clinic_before_after (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  before_url TEXT NOT NULL,
  after_url TEXT NOT NULL,
  before_path TEXT NOT NULL,
  after_path TEXT NOT NULL,
  service_id UUID REFERENCES public.clinic_services(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  patient_consent BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_before_after_clinic
  ON public.clinic_before_after(clinic_id, enabled, display_order);
ALTER TABLE public.clinic_before_after ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_before_after TO service_role;