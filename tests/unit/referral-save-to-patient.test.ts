import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const reads: Record<string, Array<{ data: unknown; error: unknown }>> = {};
  const queries: Array<{ table: string; filters: Array<[string, ...unknown[]]>; inserted?: unknown }> = [];
  const copy = vi.fn();
  const remove = vi.fn();
  return { reads, queries, copy, remove, authorizeClinicRequest: vi.fn(), roleDenied: vi.fn(() => null), ADMIN_ROLES: ['owner', 'manager'], logEvent: vi.fn() };
});

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: mocks.authorizeClinicRequest,
  roleDenied: mocks.roleDenied,
  ADMIN_ROLES: mocks.ADMIN_ROLES,
}));
vi.mock('@/lib/server/logging', () => ({ logEvent: mocks.logEvent }));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const query: { table: string; filters: Array<[string, ...unknown[]]>; inserted?: unknown } = {
        table,
        filters: [],
      };
      mocks.queries.push(query);
      const builder = {
        select: () => builder,
        eq: (...args: [string, ...unknown[]]) => {
          query.filters.push(['eq', ...args]);
          return builder;
        },
        is: (...args: [string, ...unknown[]]) => {
          query.filters.push(['is', ...args]);
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        insert: (value: unknown) => {
          query.inserted = value;
          return builder;
        },
        maybeSingle: async () => mocks.reads[table]?.shift() ?? { data: null, error: null },
        single: async () => ({ data: { id: 'saved-file' }, error: null }),
      };
      return builder;
    },
    storage: {
      from: (bucket: string) => ({
        copy: mocks.copy.mockImplementation(async () => ({ data: { path: bucket }, error: null })),
        remove: mocks.remove.mockResolvedValue({ data: [], error: null }),
      }),
    },
  },
}));

import { POST } from '@/app/api/clinic/referrals/[id]/save-to-patient/route';

const CLINIC = '11111111-1111-1111-1111-111111111111';
const CENTER = '22222222-2222-2222-2222-222222222222';
const PATIENT = '33333333-3333-3333-3333-333333333333';
const REQUEST = '44444444-4444-4444-4444-444444444444';
const SOURCE_FILE = '55555555-5555-5555-5555-555555555555';
const SOURCE_PATH = `medical/${CLINIC}/${PATIENT}/source.png`;

const requestRow = {
  id: REQUEST,
  clinic_id: CENTER,
  referring_clinic_id: CLINIC,
  patient_id: PATIENT,
  modality: 'panorama',
  requested_service: null,
};
const resultRow = {
  id: 'result-1',
  imaging_request_id: REQUEST,
  imaging_center_id: CENTER,
  referring_clinic_id: CLINIC,
  patient_id: PATIENT,
  status: 'finalized',
  images: [SOURCE_FILE],
};
const sourceRow = {
  id: SOURCE_FILE,
  clinic_id: CENTER,
  patient_id: PATIENT,
  imaging_request_id: REQUEST,
  file_type: 'image',
  mime_type: 'image/png',
  size_bytes: 4096,
  storage_path: SOURCE_PATH,
  original_filename: 'panorama.png',
};

function makeRequest(body: unknown = { file_id: SOURCE_FILE }) {
  return new Request(`https://example.com/api/clinic/referrals/${REQUEST}/save-to-patient?clinic_id=${CLINIC}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function queueSuccessfulReads() {
  mocks.reads.imaging_requests = [{ data: requestRow, error: null }];
  mocks.reads.imaging_results = [{ data: resultRow, error: null }];
  mocks.reads.patients = [{ data: { id: PATIENT, clinic_id: CLINIC }, error: null }];
  mocks.reads.medical_files = [
    { data: sourceRow, error: null },
    { data: null, error: null },
  ];
}

describe('Save referral result to patient files API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queries.length = 0;
    for (const table of Object.keys(mocks.reads)) delete mocks.reads[table];
    mocks.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: 'user-1' }, role: 'owner' });
    queueSuccessfulReads();
  });

  it('copies a finalized referral image and saves private patient-file metadata', async () => {
    const response = await POST(makeRequest(), { params: { id: REQUEST } });
    const body = await response.json();
    const insert = mocks.queries.find((query) => query.table === 'medical_files' && query.inserted);
    const metadata = insert?.inserted as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(body.already_saved).toBe(false);
    expect(mocks.copy).toHaveBeenCalledWith(
      SOURCE_PATH,
      `medical/${CLINIC}/${PATIENT}/referral-${REQUEST}-${SOURCE_FILE}.png`,
    );
    expect(metadata).toMatchObject({
      clinic_id: CLINIC,
      patient_id: PATIENT,
      imaging_request_id: null,
      file_type: 'image',
      medical_category: 'panorama',
      mime_type: 'image/png',
      size_bytes: 4096,
    });
  });

  it('rejects a file that is not listed in the finalized referral result', async () => {
    mocks.reads.imaging_results[0] = { data: { ...resultRow, images: [] }, error: null };

    const response = await POST(makeRequest(), { params: { id: REQUEST } });

    expect(response.status).toBe(404);
    expect(mocks.queries.some((query) => query.table === 'medical_files')).toBe(false);
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it('does not allow a clinic other than the referring clinic to save the image', async () => {
    mocks.reads.imaging_requests[0] = {
      data: { ...requestRow, referring_clinic_id: '66666666-6666-6666-6666-666666666666' },
      error: null,
    };

    const response = await POST(makeRequest(), { params: { id: REQUEST } });

    expect(response.status).toBe(403);
    expect(mocks.copy).not.toHaveBeenCalled();
  });
});
