-- Durable retry state for appointment-to-Google-Calendar synchronization.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS needs_google_sync boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_sync_blocked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_appointments_google_sync_retry
  ON public.appointments (created_at)
  WHERE needs_google_sync = true AND google_sync_blocked_at IS NULL;
