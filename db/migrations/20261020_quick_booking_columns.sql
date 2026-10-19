-- Add patient contact fields for quick booking
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_name TEXT,
  ADD COLUMN IF NOT EXISTS patient_phone TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dashboard';

-- Index for quick booking queries
CREATE INDEX IF NOT EXISTS idx_appointments_source
  ON public.appointments(source) WHERE source = 'web-quick';

-- Grant to service_role (follow existing pattern)
GRANT SELECT, INSERT, UPDATE ON public.appointments TO service_role;