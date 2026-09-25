import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tenantSlugExists, clearTenantSlugCache } from '@/lib/vercel/tenantLookup';

/**
 * Canonical-migration redirect — tenant existence lookup contract.
 *
 * A 301 issued for a slug that is NOT a tenant is cached by browsers and
 * crawlers essentially forever and cannot be revoked, so the lookup must be
 * strict about "exists" and must FAIL OPEN (→ no redirect) on any doubt.
 * The decision itself (`tenantRedirect`) is pure and covered by
 * `tenant-subdomains.test.ts`; this file covers the DB-backed half.
 */

const ORIGIN = 'https://www.dentairec.com';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe('tenantSlugExists (check-slug contract)', () => {
  beforeEach(() => {
    clearTenantSlugCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearTenantSlugCache();
  });

  it('reports a live tenant as existing (available:false, reason:taken)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ available: false, reason: 'taken' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(tenantSlugExists('hala-clinic', ORIGIN)).resolves.toBe(true);

    const requested = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(requested).toContain('/api/clinic/check-slug');
    expect(requested).toContain('slug=hala-clinic');
    expect(requested.startsWith(ORIGIN)).toBe(true);
  });

  it('reports a free slug as non-existent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ available: true })));
    await expect(tenantSlugExists('free-one', ORIGIN)).resolves.toBe(false);
  });

  it('fails open on HTTP errors, malformed payloads and network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'boom' }, false)));
    await expect(tenantSlugExists('hala-clinic', ORIGIN)).resolves.toBe(false);

    clearTenantSlugCache();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(null)));
    await expect(tenantSlugExists('hala-clinic', ORIGIN)).resolves.toBe(false);

    clearTenantSlugCache();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );
    await expect(tenantSlugExists('hala-clinic', ORIGIN)).resolves.toBe(false);
  });

  it('caches a settled answer so the hot path does not re-query per request', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ available: false, reason: 'taken' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(tenantSlugExists('hala-clinic', ORIGIN)).resolves.toBe(true);
    await expect(tenantSlugExists('hala-clinic', ORIGIN)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A different slug is a different question (and gets its own entry).
    await expect(tenantSlugExists('other-clinic', ORIGIN)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT cache a failed lookup (a transient error must not stick)', async () => {
    const failing = vi.fn(async () => jsonResponse({}, false));
    vi.stubGlobal('fetch', failing);
    await expect(tenantSlugExists('hala-clinic', ORIGIN)).resolves.toBe(false);
    await expect(tenantSlugExists('hala-clinic', ORIGIN)).resolves.toBe(false);
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
