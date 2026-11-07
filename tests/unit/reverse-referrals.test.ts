import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reads: {} as Record<string, Array<{ data: unknown; error: unknown }>>,
  singleReads: {} as Record<string, Array<{ data: unknown; error: unknown }>>,
  queries: [] as Array<{ table: string; inserted?: unknown; updated?: unknown }>,
  copy: vi.fn(),
  remove: vi.fn(),
  destinationPath: 'medical/22222222-2222-2222-2222-222222222222/44444444-4444-4444-4444-444444444444/saved-panorama.png',
  authorizeReverseReferral: vi.fn(),
  authorizeClinicRequest: vi.fn(),
  authorizeClinicRequest: vi.fn(),
  roleDenied: vi.fn(() => null),
  signMedicalFileUrl: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('@/lib/services/reverseReferrals', () => ({
  authorizeReverseReferral: mocks.authorizeReverseReferral,
}));
vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: mocks.authorizeClinicRequest,
  DATA_ROLES: ['owner', 'manager', 'doctor', 'receptionist', 'staff'],
  roleDenied: mocks.roleDenied,
}));
vi.mock('@/lib/services/medicalFiles', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/medicalFiles')>('@/lib/services/medicalFiles');
  return {
    ...actual,
    buildMedicalFileStoragePath: vi.fn(() => mocks.destinationPath),
    signMedicalFileUrl: mocks.signMedicalFileUrl,
  };
});
vi.mock('@/lib/server/logging', () => ({ logEvent: mocks.logEvent }));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const query: { table: string; inserted?: unknown; updated?: unknown } = { table };
      mocks.queries.push(query);
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        or: () => builder,
        limit: () => builder,
        order: () => builder,
        delete: () => builder,
        update: (value: unknown) => {
          query.updated = value;
          return builder;
        },
        insert: (value: unknown) => {
          query.inserted = value;
          return builder;
        },
        maybeSingle: async () => mocks.reads[table]?.shift() ?? { data: null, error: null },
        single: async () => mocks.singleReads[table]?.shift() ?? { data: null, error: null },
        then: (resolve: (value: { data: unknown; error: unknown }) => unknown) =>
          Promise.resolve(mocks.reads[table]?.shift() ?? { data: null, error: null }).then(resolve),
      };
      return builder;
    },
    storage: {
      from: () => ({
        copy: mocks.copy,
        remove: mocks.remove,
        upload: vi.fn(),
      }),
    },
  },
}));

import { PATCH, POST } from '@/app/api/clinic/reverse-referrals/route';

const CENTER = '11111111-1111-1111-1111-111111111111';
const TARGET_CLINIC = '22222222-2222-2222-2222-222222222222';
const SOURCE_PATIENT = '33333333-3333-3333-3333-333333333333';
const SOURCE_FILE = '55555555-5555-5555-5555-555555555555';
const SOURCE_PATH = `medical/${CENTER}/${SOURCE_PATIENT}/panorama.png`;

function request(fileId = SOURCE_FILE) {
  const form = new FormData();
  form.set('target_clinic_id', TARGET_CLINIC);
  form.set('source_patient_id', SOURCE_PATIENT);
  form.set('from_patient_name', 'مريض الاختبار');
  form.set('from_patient_phone', '0599000000');
  form.set('file_id', fileId);
  form.set('notes', 'نتيجة التصوير');
  return new Request(`https://example.com/api/clinic/reverse-referrals?clinic_id=${CENTER}`, {
    method: 'POST',
    body: form,
  });
}

function queueSuccessfulReads() {
  mocks.reads.patients = [{ data: { id: SOURCE_PATIENT }, error: null }];
  mocks.reads.medical_files = [{
    data: {
      id: SOURCE_FILE,
      clinic_id: CENTER,
      patient_id: SOURCE_PATIENT,
      file_type: 'image',
      mime_type: 'image/png',
      size_bytes: 4096,
      storage_path: SOURCE_PATH,
      original_filename: 'panorama.png',
      medical_category: 'panorama',
    },
    error: null,
  }];
  mocks.singleReads.reverse_referrals = [{ data: { id: 'reverse-1', status: 'pending' }, error: null }];
}

describe('Reverse referral API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queries.length = 0;
    for (const table of Object.keys(mocks.reads)) delete mocks.reads[table];
    for (const table of Object.keys(mocks.singleReads)) delete mocks.singleReads[table];
    mocks.authorizeReverseReferral.mockResolvedValue({
      ok: true,
      auth: { user: { id: 'center-user' } },
    });
    mocks.authorizeClinicRequest.mockResolvedValue({
      authorized: true,
      role: 'owner',
      user: { id: 'clinic-user' },
    });
    mocks.copy.mockResolvedValue({ data: { path: mocks.destinationPath }, error: null });
    mocks.remove.mockResolvedValue({ data: [], error: null });
    mocks.signMedicalFileUrl.mockResolvedValue('https://signed.example/image');
    queueSuccessfulReads();
  });

  it('records a pending referral without resolving or exposing a recipient patient', async () => {
    const response = await POST(request());
    const body = await response.json();
    const transfer = mocks.queries.find((query) => query.table === 'reverse_referrals' && query.inserted);

    expect(response.status).toBe(201);
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(transfer?.inserted).toMatchObject({
      from_clinic_id: CENTER,
      to_clinic_id: TARGET_CLINIC,
      patient_id_to: null,
      from_patient_name: 'مريض الاختبار',
      from_patient_phone: '0599000000',
      medical_file_id: SOURCE_FILE,
      image_url: SOURCE_PATH,
      status: 'pending',
    });
    expect(body.data).toEqual({ id: 'reverse-1', status: 'pending' });
    expect(JSON.stringify(body)).not.toContain('مريض الاختبار');
    expect(mocks.queries.filter((query) => query.table === 'patients')).toHaveLength(1);
  });

  it('rejects non-image source files without copying them', async () => {
    mocks.reads.medical_files[0] = {
      data: {
        id: SOURCE_FILE,
        clinic_id: CENTER,
        patient_id: SOURCE_PATIENT,
        file_type: 'pdf',
        mime_type: 'application/pdf',
        size_bytes: 4096,
        storage_path: SOURCE_PATH.replace('.png', '.pdf'),
        original_filename: 'report.pdf',
        medical_category: 'report',
      },
      error: null,
    };

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.queries.some((query) => query.table === 'reverse_referrals')).toBe(false);
  });

  it('matches the patient inside the recipient clinic and attaches the image only on acceptance', async () => {
    const referralId = '66666666-6666-6666-6666-666666666666';
    const targetPatientId = '44444444-4444-4444-4444-444444444444';
    mocks.reads.reverse_referrals = [
      {
        data: {
          id: referralId,
          from_clinic_id: CENTER,
          to_clinic_id: TARGET_CLINIC,
          patient_id_to: null,
          from_patient_name: 'مريض الاختبار',
          from_patient_phone: '0599000000',
          medical_file_id: SOURCE_FILE,
          status: 'pending',
          accepted_at: null,
        },
        error: null,
      },
      { data: { id: referralId }, error: null },
      {
        data: {
          id: referralId,
          status: 'accepted',
          accepted_at: '2026-11-07T12:00:00.000Z',
          patient_id_to: targetPatientId,
        },
        error: null,
      },
    ];
    mocks.reads.patients = [{
      data: [{ id: targetPatientId, full_name: 'مريض الاختبار', phone_number: '+970599000000' }],
      error: null,
    }];
    mocks.reads.medical_files = [{
      data: {
        id: SOURCE_FILE,
        clinic_id: CENTER,
        patient_id: SOURCE_PATIENT,
        file_type: 'image',
        mime_type: 'image/png',
        size_bytes: 4096,
        storage_path: SOURCE_PATH,
        original_filename: 'panorama.png',
        medical_category: 'panorama',
      },
      error: null,
    }];
    mocks.singleReads.medical_files = [{ data: { id: 'target-file', storage_path: mocks.destinationPath }, error: null }];

    const response = await PATCH(new Request(
      `https://example.com/api/clinic/reverse-referrals?id=${referralId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clinic_id: TARGET_CLINIC, status: 'accepted' }),
      },
    ));
    const body = await response.json();
    const targetFile = mocks.queries.find((query) => query.table === 'medical_files' && query.inserted);
    const referralUpdates = mocks.queries.filter((query) => query.table === 'reverse_referrals' && query.updated);
    const acceptedReferral = referralUpdates[referralUpdates.length - 1];

    expect(response.status).toBe(200);
    expect(body.data.patient_id_to).toBe(targetPatientId);
    expect(mocks.copy).toHaveBeenCalledWith(SOURCE_PATH, mocks.destinationPath);
    expect(targetFile?.inserted).toMatchObject({
      clinic_id: TARGET_CLINIC,
      patient_id: targetPatientId,
    });
    expect(acceptedReferral?.updated).toMatchObject({
      status: 'accepted',
      patient_id_to: targetPatientId,
      medical_file_id: 'target-file',
    });
  });
});
