-- ============================================================================
-- 20260925_patients_email_nullable.sql
-- PATIENTS EMAIL — truly optional (real-clinic blocker fix).
--
-- Bug: adding a patient WITHOUT an email failed with
--   "duplicate key value violates unique constraint idx_patients_clinic_id_email"
-- The old unique index on (clinic_id, lower(email)) is NON-partial, so any
-- clinic's SECOND patient stored with the empty-string email ('' — the
-- patients POST API normalizes a missing email to '') collides with the
-- first. (Plain NULLs are fine in a Postgres unique index, but '' is not NULL.)
--
-- Fix: drop the non-partial index and recreate it as a PARTIAL index that
-- only enforces uniqueness on non-empty emails. Also collapse any legacy ''
-- emails to NULL so historical rows are clean. NOTHING is deleted.
-- Reversal is documented at the bottom.
-- ============================================================================

-- 1) Normalize legacy empty-string emails to NULL (idempotent, no data loss —
--    '' carries no information).
UPDATE public.patients SET email = NULL WHERE email = '';

-- 2) Drop the old non-partial unique index (same name is reused below so the
--    schema documentation stays accurate).
DROP INDEX IF EXISTS public.idx_patients_clinic_id_email;

-- 3) Recreate as a PARTIAL unique index: only real, non-empty emails are
--    unique per clinic. Missing emails (NULL) never collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_clinic_id_email
  ON public.patients (clinic_id, lower(email))
  WHERE email IS NOT NULL AND lower(email) <> '';

-- 4) Ensure the column itself is nullable (idempotent; matches
--    202608240004_patients_email_nullable.sql).
ALTER TABLE public.patients ALTER COLUMN email DROP NOT NULL;

-- 5) Documentation
COMMENT ON INDEX public.idx_patients_clinic_id_email
  IS 'Uniqueness only for non-empty emails (clinic_id, lower(email)); missing emails never collide';

-- ----------------------------------------------------------------------------
-- REVERSIBILITY (documented; NOT executed):
--   UPDATE patients SET email = '' WHERE email IS NULL; -- (only if desired)
--   DROP INDEX IF EXISTS public.idx_patients_clinic_id_email;
--   CREATE UNIQUE INDEX idx_patients_clinic_id_email
--     ON public.patients (clinic_id, lower(email));
--   ALTER TABLE public.patients ALTER COLUMN email SET NOT NULL;
-- ----------------------------------------------------------------------------
