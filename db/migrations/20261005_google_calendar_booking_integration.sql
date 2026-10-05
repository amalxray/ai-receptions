-- Phase: Direct booking via Google Calendar
-- Purpose: Add the columns required to persist bookings created through the
-- Google Calendar integration while remaining compatible with the existing
-- appointments schema used by the clinic booking engine.
-- Safe to re-run because all ALTER TABLE statements use IF NOT EXISTS.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_name text,
  ADD COLUMN IF NOT EXISTS patient_phone text,
  ADD COLUMN IF NOT EXISTS appointment_time timestamptz,
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE public.appointments
SET status = 'pending'
WHERE status IS NULL OR status = '';

ALTER TABLE public.appointments
  ALTER COLUMN status SET DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_appointments_time
  ON public.appointments(appointment_time);

CREATE INDEX IF NOT EXISTS idx_appointments_google_event_id
  ON public.appointments(google_event_id);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Google Calendar direct booking service role and admin access" ON public.appointments;
CREATE POLICY "Google Calendar direct booking service role and admin access"
  ON public.appointments
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR app_is_super_admin()
    OR public.app_user_is_active_clinic_member_safe(clinic_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR app_is_super_admin()
    OR public.app_user_is_active_clinic_member_safe(clinic_id)
  );

-- Note:
-- This migration intentionally does not replace the existing booking engine.
-- It extends the same table so both the normal clinic workflow and the Google
-- Calendar direct-booking workflow can coexist until the integration is enabled.
