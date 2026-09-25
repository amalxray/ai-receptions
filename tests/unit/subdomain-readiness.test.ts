import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearVercelDomainsCache,
  isHostnameRegistered,
  isSubdomainIn,
  isSubdomainReady,
  readVercelProjectDomainNames,
  STALE_MS,
  TTL_MS,
} from '@/lib/vercel/subdomainReadiness';
import {
  resolveTenantPublicUrl,
  resolveTenantPublicUrls,
  tenantPublicUrl,
  tenantSpaceFallbackUrl,
} from '@/lib/vercel/tenantLinks';

/**
 * P1 — TENANT HOST READINESS (Vercel-authoritative) + URL FALLBACK.
 *
 * WHY this is not cosmetic: `{slug}.dentairec.com` only answers — DNS +
 * certificate — once the host is registered on the Vercel project. Provisioning
 * is best-effort at registration (every error swallowed), so a live slug can
 * exist with NO host; four of six live tenants were in that state. Every surface
 * that advertised the subdomain (canonical tag, JSON-LD, sitemap, QR redirect,
 * /ask booking link) pointed at a host whose TLS handshake aborted.
 *
 * The contract asserted here:
 *   - READINESS READS VERCEL, never the DB (`settings.tenant` can lag / be
 *     deleted by hand in the dashboard).
 *   - ONE listing answers MANY slugs (a 40-tenant sitemap is one API call).
 *   - Cached 60s; a Vercel outage keeps the last known-good answer for 10 min.
 *   - FAIL-CLOSED on "unknown": not redirecting only costs a cosmetic hop,
 *     redirecting to a dead host breaks the tenant.
 *   - The pure fallback rule picks `/c/{slug}` whenever the host is not ready.
 */

/** Fallback origin for the compatibility page — explicit so it never varies. */
const APP_ENV = { NEXT_PUBLIC_APP_URL: 'https://clinics.example.com' };

function listingResponse(names: string[], next: number | null = null): Response {
  return {
    ok: true,
    json: async () => ({
      domains: names.map((name) => ({ name })),
      pagination: { next },
    }),
  } as unknown as Response;
}

function failingResponse(): Response {
  return { ok: false, status: 403, json: async () => ({ error: 'forbidden' }) } as unknown as Response;
}

describe('P1 — Vercel project domain listing (readiness source of truth)', () => {
  beforeEach(() => {
    clearVercelDomainsCache();
    vi.stubEnv('VERCEL_API_TOKEN', 'token-123');
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_123');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    clearVercelDomainsCache();
  });

  it('reads the registered hosts, normalised to lower case', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => listingResponse(['Hala-Clinic.Dentairec.com', 'www.dentairec.com'])));

    const names = await readVercelProjectDomainNames();

    expect(names).not.toBeNull();
    expect(names!.has('hala-clinic.dentairec.com')).toBe(true);
    expect(names!.has('www.dentairec.com')).toBe(true);
    // Credentials must never travel outside the Vercel origin.
    const url = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(url.startsWith('https://api.vercel.com/v9/projects/prj_123/domains')).toBe(true);
  });

  it('follows pagination until `next` is exhausted (tenant lists can exceed one page)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listingResponse(['a-clinic.dentairec.com'], 1700000000000))
      .mockResolvedValueOnce(listingResponse(['b-clinic.dentairec.com'], null));
    vi.stubGlobal('fetch', fetchMock);

    const names = await readVercelProjectDomainNames();

    expect(names!.has('a-clinic.dentairec.com')).toBe(true);
    expect(names!.has('b-clinic.dentairec.com')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The cursor is passed back through `until`, as the v9 API expects.
    expect(String(fetchMock.mock.calls[1][0])).toContain('until=1700000000000');
  });

  it('caches a settled listing so the hot path does not call Vercel per request', async () => {
    const fetchMock = vi.fn(async () => listingResponse(['hala-clinic.dentairec.com']));
    vi.stubGlobal('fetch', fetchMock);

    await readVercelProjectDomainNames();
    await readVercelProjectDomainNames();
    await isSubdomainReady('hala-clinic');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('`fresh` bypasses a warm cache (needed right after a write)', async () => {
    const fetchMock = vi.fn(async () => listingResponse(['hala-clinic.dentairec.com']));
    vi.stubGlobal('fetch', fetchMock);

    await readVercelProjectDomainNames();
    await isHostnameRegistered('hala-clinic.dentairec.com', true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed when credentials are missing — unknown never means ready, and no call is made', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VERCEL_API_TOKEN', '');
    vi.stubEnv('VERCEL_PROJECT_ID', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(readVercelProjectDomainNames()).resolves.toBeNull();
    await expect(isSubdomainReady('hala-clinic')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on a non-2xx listing (a 403 must not open the redirect)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => failingResponse()));

    await expect(readVercelProjectDomainNames()).resolves.toBeNull();
    await expect(isSubdomainReady('hala-clinic')).resolves.toBe(false);
  });

  it('keeps the last known-good listing during an outage, then expires it (stale-if-error)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T10:00:00Z'));

    vi.stubGlobal('fetch', vi.fn(async () => listingResponse(['hala-clinic.dentairec.com'])));
    await readVercelProjectDomainNames();

    // Past the TTL → a re-fetch is attempted, but Vercel is now down.
    vi.advanceTimersByTime(TTL_MS + 1);
    vi.stubGlobal('fetch', vi.fn(async () => failingResponse()));
    await expect(isSubdomainReady('hala-clinic')).resolves.toBe(true);

    // Past the stale window → the answer may no longer be trusted.
    vi.advanceTimersByTime(STALE_MS + 1);
    await expect(isSubdomainReady('hala-clinic')).resolves.toBe(false);
  });
});

describe('P1 — isSubdomainIn (slug → host rule, fail-closed)', () => {
  const names = new Set(['hala-clinic.dentairec.com', 'www.dentairec.com']);

  it('is true only for a host registered on the project', () => {
    expect(isSubdomainIn(names, 'hala-clinic')).toBe(true);
    expect(isSubdomainIn(names, 'not-provisioned')).toBe(false);
  });

  it('is false when the listing is unknown (null) — an outage must not redirect', () => {
    expect(isSubdomainIn(null, 'hala-clinic')).toBe(false);
  });

  it('is false for reserved and DNS-unsafe labels (never a malformed host)', () => {
    expect(isSubdomainIn(new Set(['www.dentairec.com']), 'www')).toBe(false);
    expect(isSubdomainIn(new Set(['bad slug.dentairec.com']), 'bad slug')).toBe(false);
    expect(isSubdomainIn(new Set(['-dash.dentairec.com']), '-dash')).toBe(false);
  });

  it('normalises the slug before matching (case + whitespace)', () => {
    expect(isSubdomainIn(names, '  HALA-CLINIC  ')).toBe(true);
  });
});

describe('P1 — tenant public URL fallback (pure rule)', () => {
  it('uses the canonical subdomain when the host is ready', () => {
    expect(tenantPublicUrl('hala-clinic', true, APP_ENV)).toBe('https://hala-clinic.dentairec.com');
  });

  it('falls back to the reachable /c/{slug} page when the host is not ready', () => {
    expect(tenantPublicUrl('hala-clinic', false, APP_ENV)).toBe('https://clinics.example.com/c/hala-clinic');
  });

  it('the fallback path encodes the slug and follows the deployment origin', () => {
    expect(tenantSpaceFallbackUrl('hala clinic', APP_ENV)).toBe('https://clinics.example.com/c/hala%20clinic');
    expect(tenantSpaceFallbackUrl('hala-clinic', { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })).toBe(
      'http://localhost:3000/c/hala-clinic'
    );
  });

  it('never emits a malformed host even when readiness is (wrongly) reported true', () => {
    // `clinicSpaceUrl` itself refuses a non-DNS label and returns the apex path.
    expect(tenantPublicUrl('bad slug', true, APP_ENV)).toBe('https://www.dentairec.com/bad%20slug');
    expect(tenantPublicUrl('www', true, APP_ENV)).toBe('https://www.dentairec.com/www');
  });
});

describe('P1 — resolved URLs (readiness + fallback together)', () => {
  beforeEach(() => {
    clearVercelDomainsCache();
    vi.stubEnv('VERCEL_API_TOKEN', 'token-123');
    vi.stubEnv('VERCEL_PROJECT_ID', 'prj_123');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearVercelDomainsCache();
  });

  it('resolves a ready tenant to its subdomain and an unprovisioned one to /c/{slug}', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => listingResponse(['ready-clinic.dentairec.com'])));

    await expect(resolveTenantPublicUrl('ready-clinic', APP_ENV)).resolves.toBe(
      'https://ready-clinic.dentairec.com'
    );
    await expect(resolveTenantPublicUrl('lagging-clinic', APP_ENV)).resolves.toBe(
      'https://clinics.example.com/c/lagging-clinic'
    );
  });

  it('resolves a whole batch with ONE Vercel call (sitemap / /ask)', async () => {
    const fetchMock = vi.fn(async () =>
      listingResponse(['clinic-a.dentairec.com', 'clinic-b.dentairec.com', 'clinic-c.dentairec.com'])
    );
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await resolveTenantPublicUrls(['clinic-a', 'clinic-b', 'clinic-c', 'clinic-d'], APP_ENV);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolved.get('clinic-a')).toBe('https://clinic-a.dentairec.com');
    expect(resolved.get('clinic-b')).toBe('https://clinic-b.dentairec.com');
    expect(resolved.get('clinic-c')).toBe('https://clinic-c.dentairec.com');
    expect(resolved.get('clinic-d')).toBe('https://clinics.example.com/c/clinic-d');
  });

  it('falls back for every slug when the listing is unreadable (fail-closed)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => failingResponse()));

    await expect(resolveTenantPublicUrl('hala-clinic', APP_ENV)).resolves.toBe(
      'https://clinics.example.com/c/hala-clinic'
    );
  });
});
