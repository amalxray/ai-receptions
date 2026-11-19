import { beforeEach, describe, expect, it, vi } from 'vitest';

const tusState = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  resumed: false,
  started: false,
}));
const sessionState = vi.hoisted(() => ({ accessToken: 'medical-user-jwt', userId: 'user-one' }));

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
          session: sessionState.accessToken
            ? { access_token: sessionState.accessToken, user: { id: sessionState.userId } }
            : null,
        },
        error: null,
      })),
    },
  },
}));

import {
  clearMedicalClientUploadId,
  getMedicalClientUploadId,
  startMedicalTusUpload,
} from '@/lib/services/medicalFileTusUpload';

describe('medical file TUS upload', () => {
  beforeEach(() => {
    tusState.options = null;
    tusState.resumed = false;
    tusState.started = false;
    sessionState.accessToken = 'medical-user-jwt';
    sessionState.userId = 'user-one';
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

  it('uses sampled bytes in the resume identity and clears only the completed file identity', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const fileA = new File(['first scan'], 'scan.dcm', { type: 'application/dicom', lastModified: 10 });
    const fileB = new File(['other scan'], 'scan.dcm', { type: 'application/dicom', lastModified: 10 });

    const idA = await getMedicalClientUploadId('clinic-a', 'patient-a', fileA);
    const idAAgain = await getMedicalClientUploadId('clinic-a', 'patient-a', fileA);
    const idB = await getMedicalClientUploadId('clinic-a', 'patient-a', fileB);
    expect(idAAgain).toBe(idA);
    expect(idB).not.toBe(idA);

    await clearMedicalClientUploadId('clinic-a', 'patient-a', fileA);
    expect(await getMedicalClientUploadId('clinic-a', 'patient-a', fileA)).not.toBe(idA);
    expect(await getMedicalClientUploadId('clinic-a', 'patient-a', fileB)).toBe(idB);
  });

  it('keeps repeat selection idempotent per user and file scope but separates request scopes and users', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        get length() { return values.size; },
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const file = new File(['same scan'], 'same.dcm', { type: 'application/dicom', lastModified: 20 });
    const first = await getMedicalClientUploadId('clinic-a', 'patient-a', file, 'request-1');
    expect(await getMedicalClientUploadId('clinic-a', 'patient-a', file, 'request-1')).toBe(first);
    expect(await getMedicalClientUploadId('clinic-a', 'patient-a', file, 'request-2')).not.toBe(first);

    sessionState.userId = 'user-two';
    expect(await getMedicalClientUploadId('clinic-a', 'patient-a', file, 'request-1')).not.toBe(first);
  });
});
