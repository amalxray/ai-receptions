import { beforeEach, describe, expect, it, vi } from 'vitest';

const tusState = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  resumed: false,
  started: false,
}));
const sessionState = vi.hoisted(() => ({ accessToken: 'medical-user-jwt' }));

vi.mock('tus-js-client', () => ({
  Upload: class FakeUpload {
    options: Record<string, unknown>;

    constructor(_file: File, options: Record<string, unknown>) {
      this.options = options;
      tusState.options = options;
    }

    async findPreviousUploads() {
      return [{ uploadUrl: 'https://storage.example.test/resume' }];
    }

    resumeFromPreviousUpload() {
      tusState.resumed = true;
    }

    start() {
      tusState.started = true;
      (this.options.onSuccess as () => void)();
    }

    async abort() {}
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: sessionState.accessToken ? { access_token: sessionState.accessToken } : null,
        },
        error: null,
      })),
    },
  },
}));

import { startMedicalTusUpload } from '@/lib/services/medicalFileTusUpload';

describe('medical file TUS upload', () => {
  beforeEach(() => {
    tusState.options = null;
    tusState.resumed = false;
    tusState.started = false;
    sessionState.accessToken = 'medical-user-jwt';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-test-key';
  });

  it('resumes uploads with 6 MiB chunks and the authenticated user token', async () => {
    const upload = startMedicalTusUpload({
      file: new File(['scan'], 'scan.dcm', { type: 'application/dicom' }),
      endpoint: 'https://project.storage.supabase.co/storage/v1/upload/resumable',
      storagePath: 'medical/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/scan.dcm',
      clientUploadId: '33333333-3333-4333-8333-333333333333',
      onProgress: () => {},
    });

    await upload.promise;

    expect(tusState.resumed).toBe(true);
    expect(tusState.started).toBe(true);
    expect(tusState.options?.chunkSize).toBe(6 * 1024 * 1024);
    expect(tusState.options?.removeFingerprintOnSuccess).toBe(true);
    expect(tusState.options?.headers).toEqual({
      apikey: 'public-test-key',
      authorization: 'Bearer medical-user-jwt',
    });
    const requestHeaders: Record<string, string> = {};
    const onBeforeRequest = tusState.options?.onBeforeRequest as (
      request: { setHeader: (name: string, value: string) => void },
    ) => Promise<void>;
    sessionState.accessToken = 'refreshed-medical-user-jwt';
    await onBeforeRequest({ setHeader: (name, value) => { requestHeaders[name] = value; } });
    expect(requestHeaders.Authorization).toBe('Bearer refreshed-medical-user-jwt');
    expect(tusState.options?.metadata).toMatchObject({
      bucketName: 'medical-files',
      objectName: expect.stringContaining('medical/11111111-'),
      contentType: 'application/dicom',
    });
  });

  it('does not start an upload when there is no authenticated user session', async () => {
    sessionState.accessToken = '';
    const upload = startMedicalTusUpload({
      file: new File(['scan'], 'scan.dcm', { type: 'application/dicom' }),
      endpoint: 'https://project.storage.supabase.co/storage/v1/upload/resumable',
      storagePath: 'medical/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/scan.dcm',
      clientUploadId: '33333333-3333-4333-8333-333333333333',
      onProgress: () => {},
    });

    await expect(upload.promise).rejects.toThrow('يلزم تسجيل الدخول لرفع الملف');
    expect(tusState.options).toBeNull();
  });
});
