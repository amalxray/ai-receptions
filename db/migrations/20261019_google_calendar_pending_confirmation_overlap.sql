-- Treat Google Calendar bookings awaiting event creation as active reservations.
-- Scope the race-protection index to a clinic/provider pair so tenants cannot
-- interfere with each other's appointments.

DROP INDEX IF EXISTS idx_appointments_unique_active_slot;

CREATE UNIQUE INDEX idx_appointments_unique_active_slot
  ON public.appointments(clinic_id, provider_id, scheduled_at)
  WHERE status IN ('scheduled', 'tentative', 'pending_confirmation', 'confirmed')
    AND deleted_at IS NULL
    AND provider_id IS NOT NULL;
