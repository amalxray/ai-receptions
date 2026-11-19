import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedMedicalFileUrl } from '@/lib/services/medicalFileSignedUrlCache';

describe('medical file signed URL cache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reuses a URL only for the same authenticated user', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: { signed_url: `https://storage.example.test/signed-${fetchMock.mock.calls.length}` },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const base = {
      fileId: '33333333-3333-4333-8333-333333333333',
      clinicId: '11111111-1111-4111-8111-111111111111',
      variant: 'preview' as const,
    };

    const firstUserHeaders = async () => ({ authorization: 'Bearer user-one-token' });
    const firstUrl = await getCachedMedicalFileUrl({ ...base, authHeaders: firstUserHeaders });
    const reusedUrl = await getCachedMedicalFileUrl({ ...base, authHeaders: firstUserHeaders });
    const secondUserUrl = await getCachedMedicalFileUrl({
      ...base,
      authHeaders: async () => ({ authorization: 'Bearer user-two-token' }),
    });

    expect(firstUrl).toBe(reusedUrl);
    expect(secondUserUrl).not.toBe(firstUrl);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a URL when the request has no authorization header', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: { signed_url: 'https://storage.example.test/signed' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      fileId: '44444444-4444-4444-8444-444444444444',
      clinicId: '11111111-1111-4111-8111-111111111111',
      variant: 'original' as const,
      authHeaders: async () => ({}),
    };

    await getCachedMedicalFileUrl(input);
    await getCachedMedicalFileUrl(input);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
