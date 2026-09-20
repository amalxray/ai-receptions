-- ============================================================================
-- 20260926_imaging_requests_center_patient.sql
-- SEPARATE the two patient references on imaging_requests (additive, safe).
--
-- patient_id        → the REFERRING clinic's patient (set at referral time;
--                     the center never renders it as its own file).
-- patient_id_center → the receiving imaging center's OWN patient file,
--                     created/linked via POST /api/imaging/requests/:id/
--                     create-patient (phone match → existing center patient,
--                     else create). Before this column the create flow 409'd
--                     on patient_id, so cross-tenant referrals could NEVER
--                     get a center-side file.
-- ============================================================================

alter table public.imaging_requests
  add column if not exists patient_id_center uuid references public.patients(id) on delete set null;

comment on column public.imaging_requests.patient_id_center
  IS 'Patient file in the receiving imaging center (created/linked on intake); patient_id remains the referring clinic''s patient';

create index if not exists idx_imaging_requests_center_patient
  on public.imaging_requests (patient_id_center) where deleted_at is null;

-- ----------------------------------------------------------------------------
-- REVERSIBILITY (documented; NOT executed):
--   alter table imaging_requests drop column patient_id_center;
-- ----------------------------------------------------------------------------
