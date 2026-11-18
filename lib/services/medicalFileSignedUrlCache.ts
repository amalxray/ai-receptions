'use client';

type MedicalFileUrlVariant = 'original' | 'preview';
type CachedSignedUrl = { url: string; expiresAt: number };

const signedUrlCache = new Map<string, CachedSignedUrl>();
const CACHE_DURATION_MS = 8 * 60 * 1000;

export async function getCachedMedicalFileUrl(input: {
  fileId: string;
  clinicId: string;
  variant: MedicalFileUrlVariant;
  authHeaders: () => Promise<Record<string, string>>;
}): Promise<string> {
  const headers = await input.authHeaders();
  const authorization = headers.authorization ?? headers.Authorization;
  const authFingerprint = authorization
    ? await fingerprintAuthorization(authorization)
    : null;
  const cacheKey = authFingerprint
    ? `${authFingerprint}:${input.clinicId}:${input.fileId}:${input.variant}`
    : null;
  const cached = cacheKey ? signedUrlCache.get(cacheKey) : null;
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const response = await fetch(
    `/api/clinic/medical-files/${encodeURIComponent(input.fileId)}?clinic_id=${encodeURIComponent(input.clinicId)}&variant=${input.variant}`,
    { headers, cache: 'no-store' },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.data?.signed_url !== 'string') {
    throw new Error(body?.error || 'تعذر إنشاء رابط الملف المؤقت');
  }

  if (cacheKey) {
    signedUrlCache.set(cacheKey, { url: body.data.signed_url, expiresAt: Date.now() + CACHE_DURATION_MS });
  }
  if (signedUrlCache.size > 500) {
    const oldestKey = signedUrlCache.keys().next().value;
    if (oldestKey) signedUrlCache.delete(oldestKey);
  }
  return body.data.signed_url;
}

async function fingerprintAuthorization(authorization: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authorization));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
