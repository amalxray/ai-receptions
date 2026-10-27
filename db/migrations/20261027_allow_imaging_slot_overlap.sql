-- Imaging centers use short sessions and may intentionally book multiple patients
-- at the same displayed hour. The application-level availability check enforces
-- the imaging-only cap and total-duration rule; this index must not reject the
-- second/third imaging booking before that check can run.

DROP INDEX IF EXISTS idx_appointments_unique_active_slot;

CREATE INDEX IF NOT EXISTS idx_appointments_active_provider_slot
  ON public.appointments(clinic_id, provider_id, scheduled_at)
  WHERE status IN ('scheduled', 'tentative', 'pending_confirmation', 'confirmed')
    AND deleted_at IS NULL
    AND provider_id IS NOT NULL;
