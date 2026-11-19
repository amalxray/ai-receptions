import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  upsert: vi.fn(),
  update: vi.fn(),
  signedUpload: vi.fn(),
}));

vi.mock('crypto', () => ({
  randomUUID: () => 'same-upload-path',
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({ createSignedUploadUrl: state.signedUpload }),
    },
    from: () => {
      const updateQuery: any = {
        eq: vi.fn(() => updateQuery),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      };
      state.update.mockReturnValue(updateQuery);
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        upsert: state.upsert,
        update: state.update,
      };
      return query;
    },
  },
}));

import { createMedicalUploadIntent } from '@/lib/services/medicalFiles';

const input = {
  clinicId: '11111111-1111-1111-1111-111111111111',
  patientClinicId: '22222222-2222-2222-2222-222222222222',
  patientId: '33333333-3333-3333-3333-333333333333',
  clientUploadId: '44444444-4444-4444-8444-444444444444',
  imagingRequestId: null,
  appointmentId: null,
  filename: 'panorama.png',
  mimeType: 'image/png',
  sizeBytes: 100,
  uploadedBy: null,
};

describe('medical upload session retries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    state.signedUpload.mockResolvedValue({
      data: { signedUrl: 'https://storage.test/upload', token: 'fresh-token' },
      error: null,
    });
    state.upsert.mockResolvedValue({ error: null });
  });

  it('reuses the existing session when the same storage path is started twice', async () => {
    state.upsert
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "uq_medical_upload_session_path"',
        },
      });

    const first = await createMedicalUploadIntent(input);
    const second = await createMedicalUploadIntent(input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(state.upsert).toHaveBeenCalledTimes(2);
    expect(state.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ storage_path: expect.stringContaining('same-upload-path') }), {
      onConflict: 'clinic_id,storage_path',
    });
    expect(state.update).toHaveBeenCalledTimes(1);
  });

  it('returns a database error instead of silently issuing an untracked upload', async () => {
    state.upsert.mockResolvedValue({ error: { code: 'XX000', message: 'database unavailable' } });

    const result = await createMedicalUploadIntent(input);

    expect(result).toEqual({ ok: false, message: 'تعذر حفظ جلسة الرفع: database unavailable' });
    expect(state.update).not.toHaveBeenCalled();
  });
});
