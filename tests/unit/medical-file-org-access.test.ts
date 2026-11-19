import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  patient: { id: '22222222-2222-4222-8222-222222222222', clinic_id: '11111111-1111-4111-8111-111111111111' } as null | { id: string; clinic_id: string },
  request: null as null | { id: string; clinic_id: string; referring_clinic_id: string; patient_id: string },
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        maybeSingle: async () => ({
          data: table === 'patients' ? state.patient : state.request,
          error: null,
        }),
      };
      return query;
    },
  },
}));

import { resolveMedicalFileOrgAccess } from '@/lib/services/medicalFiles';

const OWNER_CLINIC = '11111111-1111-4111-8111-111111111111';
const PARTNER_CLINIC = '33333333-3333-4333-8333-333333333333';
const UNRELATED_CLINIC = '44444444-4444-4444-8444-444444444444';
const PATIENT = '22222222-2222-4222-8222-222222222222';
const REQUEST = '55555555-5555-4555-8555-555555555555';

describe('medical file tenant ownership and authorized referral sharing', () => {
  beforeEach(() => {
    state.patient = { id: PATIENT, clinic_id: OWNER_CLINIC };
    state.request = {
      id: REQUEST,
      clinic_id: PARTNER_CLINIC,
      referring_clinic_id: OWNER_CLINIC,
      patient_id: PATIENT,
    };
  });

  it('allows the patient-owning clinic to access its files', async () => {
    await expect(resolveMedicalFileOrgAccess(OWNER_CLINIC, PATIENT, null))
      .resolves.toEqual({ ok: true, patient: state.patient });
  });

  it('denies another clinic access without an imaging request', async () => {
    await expect(resolveMedicalFileOrgAccess(PARTNER_CLINIC, PATIENT, null))
      .resolves.toEqual({ ok: false, message: 'لا تملك صلاحية على ملفات هذا المريض' });
  });

  it('allows both parties to access files only through the linking imaging request', async () => {
    await expect(resolveMedicalFileOrgAccess(OWNER_CLINIC, PATIENT, REQUEST))
      .resolves.toMatchObject({ ok: true });
    await expect(resolveMedicalFileOrgAccess(PARTNER_CLINIC, PATIENT, REQUEST))
      .resolves.toMatchObject({ ok: true });
  });

  it('denies unrelated clinics and requests for a different patient', async () => {
    await expect(resolveMedicalFileOrgAccess(UNRELATED_CLINIC, PATIENT, REQUEST))
      .resolves.toMatchObject({ ok: false });
    state.request = { ...state.request!, patient_id: UNRELATED_CLINIC };
    await expect(resolveMedicalFileOrgAccess(PARTNER_CLINIC, PATIENT, REQUEST))
      .resolves.toEqual({ ok: false, message: 'الطلب لا يخص هذا المريض' });
  });
});
