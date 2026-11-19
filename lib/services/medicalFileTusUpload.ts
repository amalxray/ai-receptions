'use client';

import { Upload } from 'tus-js-client';
import { supabase } from '@/lib/supabase';

const TUS_CHUNK_SIZE = 6 * 1024 * 1024;
const CLIENT_UPLOAD_STORAGE_PREFIX = 'medical-upload-id:';

type TusUploadOptions = {
  file: File;
  endpoint: string;
  storagePath: string;
  clientUploadId: string;
  onProgress: (percentage: number) => void;
};

export async function getMedicalClientUploadId(
  clinicId: string,
  patientId: string,
  file: File,
  scope = '',
): Promise<string> {
  const key = await getClientUploadStorageKey(clinicId, patientId, file, scope);
  const storedId = window.localStorage.getItem(key);
  if (storedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storedId)) {
    return storedId;
  }

  const clientUploadId = crypto.randomUUID();
  trimClientUploadIds(key);
  window.localStorage.setItem(key, clientUploadId);
  return clientUploadId;
}

export async function clearMedicalClientUploadId(
  clinicId: string,
  patientId: string,
  file: File,
  scope = '',
): Promise<void> {
  const key = await getClientUploadStorageKey(clinicId, patientId, file, scope);
  window.localStorage.removeItem(key);
}

async function getClientUploadStorageKey(clinicId: string, patientId: string, file: File, scope: string): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (sessionError || !userId) throw new Error('يجب تسجيل الدخول لاستئناف رفع الملفات الطبية');

  const contentFingerprint = await fingerprintFileForResume(file);
  const identity = [clinicId, patientId, userId, scope, file.name, file.size, file.lastModified, file.type, contentFingerprint].join('\u0000');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  return `${CLIENT_UPLOAD_STORAGE_PREFIX}${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function trimClientUploadIds(keepKey: string): void {
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(CLIENT_UPLOAD_STORAGE_PREFIX)) keys.push(key);
  }
  while (keys.length >= 500) {
    const oldestKey = keys.shift();
    if (oldestKey && oldestKey !== keepKey) window.localStorage.removeItem(oldestKey);
  }
}

/**
 * Uses a full SHA-256 for files up to 64 MiB and bounded samples for larger
 * CBCT/DICOM files. This is a browser-local resume identity, not a
 * server-verified cross-user content hash.
 */
async function fingerprintFileForResume(file: File): Promise<string> {
  const fullHashLimit = 64 * 1024 * 1024;
  if (file.size <= fullHashLimit) {
    return digestHex(await file.arrayBuffer());
  }

  const sampleBytes = 64 * 1024;
  const starts = [
    0,
    Math.max(0, Math.floor((file.size - sampleBytes) / 2)),
    Math.max(0, file.size - sampleBytes),
  ];
  const ranges = starts
    .map((start) => [start, Math.min(file.size, start + sampleBytes)] as [number, number])
    .filter((range, index, all) =>
      all.findIndex(([start, end]) => start === range[0] && end === range[1]) === index,
    );
  const samples = await Promise.all(ranges.map(([start, end]) => file.slice(start, end).arrayBuffer()));
  const totalBytes = samples.reduce((total, sample) => total + sample.byteLength, 0);
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const sample of samples) {
    combined.set(new Uint8Array(sample), offset);
    offset += sample.byteLength;
  }
  return digestHex(combined);
}

async function digestHex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = data instanceof ArrayBuffer ? data : new Uint8Array(data).buffer as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function startMedicalTusUpload({
  file,
  endpoint,
  storagePath,
  clientUploadId,
  onProgress,
}: TusUploadOptions): { promise: Promise<void>; cancel: () => void } {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error('إعداد مفتاح Supabase العام غير متاح لرفع الملفات');

  let upload: Upload | null = null;
  let cancelled = false;
  let settleCancel: (() => void) | null = null;
  const promise = (async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (sessionError || !accessToken) {
      throw new Error(sessionError?.message ?? 'يلزم تسجيل الدخول لرفع الملف');
    }
    if (cancelled) throw new Error('CANCELLED');

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      settleCancel = () => rejectOnce(new Error('CANCELLED'));

      const tusUpload = new Upload(file, {
        endpoint,
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${accessToken}`,
        },
        onBeforeRequest: async (request) => {
          const { data, error } = await supabase.auth.getSession();
          const refreshedToken = data.session?.access_token;
          if (error || !refreshedToken) {
            throw new Error(error?.message ?? 'انتهت جلسة الدخول؛ سجّل الدخول مجددًا لاستكمال الرفع');
          }
          request.setHeader('Authorization', `Bearer ${refreshedToken}`);
        },
        metadata: {
          bucketName: 'medical-files',
          objectName: storagePath,
          contentType: file.type || 'application/octet-stream',
          cacheControl: '3600',
        },
        chunkSize: TUS_CHUNK_SIZE,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        fingerprint: async () => `${endpoint}:${clientUploadId}:${file.size}:${file.lastModified}`,
        onProgress: (bytesSent, bytesTotal) => {
          onProgress(Math.min(95, Math.max(1, Math.round((bytesSent / bytesTotal) * 95))));
        },
        onError: (error) => rejectOnce(error instanceof Error ? error : new Error(String(error))),
        onSuccess: resolveOnce,
      });
      upload = tusUpload;

      void tusUpload.findPreviousUploads().then((previousUploads) => {
        if (cancelled) {
          settleCancel?.();
          return;
        }
        if (previousUploads.length > 0) tusUpload.resumeFromPreviousUpload(previousUploads[0]);
        tusUpload.start();
      }).catch((error: unknown) => {
        rejectOnce(error instanceof Error ? error : new Error(String(error)));
      });
    });
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (upload) void upload.abort().finally(() => settleCancel?.());
    },
  };
}
