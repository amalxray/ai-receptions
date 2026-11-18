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
): Promise<string> {
  const identity = [
    clinicId,
    patientId,
    file.name,
    file.size,
    file.lastModified,
    file.type,
  ].join('\u0000');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  const key = `${CLIENT_UPLOAD_STORAGE_PREFIX}${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  const storedId = window.localStorage.getItem(key);
  if (storedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storedId)) {
    return storedId;
  }

  const clientUploadId = crypto.randomUUID();
  window.localStorage.setItem(key, clientUploadId);
  return clientUploadId;
}

export async function clearMedicalClientUploadId(
  clinicId: string,
  patientId: string,
  file: File,
): Promise<void> {
  const identity = [
    clinicId,
    patientId,
    file.name,
    file.size,
    file.lastModified,
    file.type,
  ].join('\u0000');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  const key = `${CLIENT_UPLOAD_STORAGE_PREFIX}${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  window.localStorage.removeItem(key);
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
