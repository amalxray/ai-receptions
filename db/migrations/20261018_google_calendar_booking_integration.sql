-- Minimal persistence for the staged clinic Google Calendar booking scaffold.
-- No policies are replaced and no existing appointment statuses are rewritten.
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS google_calendar_id text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_name text,
  ADD COLUMN IF NOT EXISTS patient_phone text,
  ADD COLUMN IF NOT EXISTS appointment_time timestamptz,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_event_id text;

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_calendar_time
  ON public.appointments (clinic_id, appointment_time);

CREATE INDEX IF NOT EXISTS idx_appointments_google_event_id
  ON public.appointments (google_event_id)
  WHERE google_event_id IS NOT NULL;
