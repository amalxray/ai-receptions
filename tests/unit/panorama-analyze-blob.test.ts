import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  from: vi.fn(),
  storageDownload: vi.fn(),
  inferenceFetch: vi.fn(),
}));

vi.mock('@/lib/config', () => ({
  getSupabaseEnvConfig: () => ({ isConfigured: true }),
}));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: mocks.authorizeClinicRequest,
  DATA_ROLES: ['owner', 'admin', 'receptionist'],
  roleDenied: () => null,
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimit: () => ({ ok: true }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: mocks.from,
    storage: {
      from: () => ({ download: mocks.storageDownload }),
    },
  },
}));

vi.mock('@/lib/ai/panoramaInferenceConfig', () => ({
  getPanoramaInferenceConfig: () => ({
    endpoint: new URL('https://inference.example.com/analyze'),
    apiKey: 'test-api-key',
  }),
}));

vi.mock('file-type', () => ({
  fileTypeFromBuffer: async () => ({ mime: 'image/png', ext: 'png' }),
}));

import { POST } from '@/app/api/ai/panorama-analyze/route';

const clinicId = '11111111-1111-1111-1111-111111111111';
const patientId = '22222222-2222-2222-2222-222222222222';
const medicalFileId = '33333333-3333-3333-3333-333333333333';
const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe('panorama analysis image upload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeClinicRequest.mockResolvedValue({
      authorized: true,
      user: { id: 'user-1' },
      role: 'owner',
    });

    let activeTable = '';
    const query: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn(),
      insert: vi.fn(),
      single: vi.fn(),
    };
    for (const method of ['select', 'eq', 'is', 'insert']) {
      query[method].mockReturnValue(query);
    }
    query.maybeSingle.mockImplementation(async () => ({
      data: activeTable === 'patients'
        ? { id: patientId }
        : { id: medicalFileId, size_bytes: pngBytes.byteLength, medical_category: 'panorama' },
      error: null,
    }));
    query.single.mockResolvedValue({
      data: {
        id: 'analysis-1',
        model_version: 'test-model',
        image_width: 1,
        image_height: 1,
        predictions: [],
        created_at: new Date().toISOString(),
      },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      activeTable = table;
      return query;
    });

    vi.stubGlobal('fetch', mocks.inferenceFetch);
    mocks.inferenceFetch.mockResolvedValue(
      Response.json({
        predictions: [],
        model_version: 'test-model',
        image_width: 1,
        image_height: 1,
      }),
    );
  });

  it('passes the supplied image Blob to inference without downloading it from Storage again', async () => {
    const image = new File([pngBytes], 'panorama.png', { type: 'image/png' });
    const formData = new FormData();
    formData.set('clinic_id', clinicId);
    formData.set('patient_id', patientId);
    formData.set('medical_file_id', medicalFileId);
    formData.set('consent', 'true');
    formData.set('image', image);

    const response = await POST(new Request('https://clinic.example.com/api/ai/panorama-analyze', {
      method: 'POST',
      body: formData,
    }));

    expect(response.status).toBe(201);
    expect(mocks.storageDownload).not.toHaveBeenCalled();
    expect(mocks.inferenceFetch).toHaveBeenCalledTimes(1);
    const inferenceForm = mocks.inferenceFetch.mock.calls[0][1].body as FormData;
    const inferenceImage = inferenceForm.get('image');
    expect(inferenceImage).toBeInstanceOf(Blob);
    expect(Buffer.from(await (inferenceImage as Blob).arrayBuffer())).toEqual(pngBytes);
  });
});
