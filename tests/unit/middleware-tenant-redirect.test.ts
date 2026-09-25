import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Canonical-migration wiring — the middleware must issue the 301 itself.
 *
 * The decision logic is unit-tested in `tenant-subdomains.test.ts` and the
 * lookup in `tenant-redirect-lookup.test.ts`; this file asserts the WIRING:
 * status code, Location header, query preservation and, critically, that a
 * non-tenant slug is never permanently redirected.
 */

// Demo mode (no Supabase env) keeps the session-refresh branch out of the way —
// the redirect block must run BEFORE it and independently of it.
vi.mock('@/lib/supabase/config', () => ({
  getSupabaseCoreConfig: () => ({ supabaseUrl: undefined, anonKey: undefined }),
}));

import { middleware } from '@/middleware';
import { clearTenantSlugCache } from '@/lib/vercel/tenantLookup';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

/**
 * A real request always carries a `Host` header (that is what `hostHeader()`
 * reads, with `x-forwarded-host` taking priority behind Vercel's proxy), so the
 * test harness must set it explicitly — `new NextRequest(url)` alone has none.
 */
function request(url: string, host?: string): NextRequest {
  const target = new URL(url);
  return new NextRequest(url, { headers: { host: host ?? target.host } });
}

describe('middleware — legacy URL → tenant subdomain (301)', () => {
  beforeEach(() => {
    clearTenantSlugCache();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ available: false, reason: 'taken' })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearTenantSlugCache();
  });

  it('301-redirects the apex path of a live tenant to its subdomain', async () => {
    const res = await middleware(request('https://www.dentairec.com/hala-clinic'));

    expect(res.status).toBe(301);
    // `new URL()` normalizes the empty root path to `/` — the same URL.
    expect(res.headers.get('location')).toBe('https://hala-clinic.dentairec.com/');
  });

  it('preserves the query string on the redirect (utm/analytics continuity)', async () => {
    const res = await middleware(request('https://www.dentairec.com/hala-clinic?utm_source=fb'));

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://hala-clinic.dentairec.com/?utm_source=fb');
  });

  it('301-redirects a www.<slug> host to the bare subdomain, keeping the path', async () => {
    const res = await middleware(
      request('https://www.hala-clinic.dentairec.com/book', 'www.hala-clinic.dentairec.com')
    );

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://hala-clinic.dentairec.com/book');
    // Host-level redirects need no tenant lookup.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('NEVER permanently redirects a slug that is not a tenant (no poisoned 301)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ available: true })));

    const res = await middleware(request('https://www.dentairec.com/typed-a-typo'));

    expect(res.headers.get('location')).toBeNull();
    expect(res.status).not.toBe(301);
  });

  it('leaves platform routes, crawler files and deep links alone', async () => {
    for (const path of ['/book', '/discover', '/ask', '/login', '/sitemap.xml', '/c/hala-clinic', '/d/dr-x']) {
      const res = await middleware(request(`https://www.dentairec.com${path}`));
      expect(res.headers.get('location'), path).toBeNull();
    }
  });

  it('rewrites the tenant root to the tenant space on the canonical host', async () => {
    const res = await middleware(
      request('https://hala-clinic.dentairec.com/', 'hala-clinic.dentairec.com')
    );

    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-rewrite')).toContain('https://hala-clinic.dentairec.com/hala-clinic');
  });
});
