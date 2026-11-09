CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date_active
  ON public.appointments (clinic_id, appointment_date)
  WHERE deleted_at IS NULL;
