import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  TENANT_ROOT_DOMAIN,
  RESERVED_SUBDOMAINS,
  apexTenantSlugFromPath,
  clinicSpaceUrl,
  clinicSubdomain,
  isValidTenantSlug,
  tenantPathRewrite,
  tenantRedirect,
  tenantSlugFromHostname,
} from '@/lib/vercel/domains';
// Imported from its own module (not re-exported through lib/vercel/domains) so
// the source of truth stays single: registration validation, the middleware
// contract and this invariant all read one list.
import { RESERVED_PUBLIC_SLUGS } from '@/lib/services/activityTypes';

const APP_DIR = join(process.cwd(), 'app');

/**
 * Every URL segment that a static route can occupy directly under `app/`.
 * Route-group folders (`(auth)`, `(dashboard)`) do not appear in the URL, so
 * their child folders are collected instead. Dynamic segments (`[slug]`) are
 * skipped: they are the tenant space itself.
 */
function staticRouteSegments(): string[] {
  const segments: string[] = [];
  for (const entry of readdirSync(APP_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('[') || entry.name.startsWith('_')) continue;
    if (entry.name.startsWith('(')) {
      for (const child of readdirSync(join(APP_DIR, entry.name), { withFileTypes: true })) {
        if (child.isDirectory() && !child.name.startsWith('[')) segments.push(child.name);
      }
      continue;
    }
    segments.push(entry.name);
  }
  return segments;
}

describe('tenant subdomain routing', () => {
  it('derives the root domain from the canonical origin', () => {
    expect(TENANT_ROOT_DOMAIN).toBe('dentairec.com');
  });

  it('maps a tenant host to its label', () => {
    expect(tenantSlugFromHostname('hala-clinic.dentairec.com')).toBe('hala-clinic');
    expect(tenantSlugFromHostname('amal-x-ray-center.dentairec.com')).toBe('amal-x-ray-center');
  });

  it('strips a port and trailing dot', () => {
    expect(tenantSlugFromHostname('hala-clinic.dentairec.com:3000')).toBe('hala-clinic');
    expect(tenantSlugFromHostname('hala-clinic.dentairec.com.')).toBe('hala-clinic');
  });

  it('never treats platform/infra hosts as tenants', () => {
    expect(tenantSlugFromHostname('dentairec.com')).toBeNull();
    expect(tenantSlugFromHostname('www.dentairec.com')).toBeNull();
    expect(tenantSlugFromHostname('api.dentairec.com')).toBeNull();
    expect(tenantSlugFromHostname('dashboard.dentairec.com')).toBeNull();
    expect(tenantSlugFromHostname('mail.dentairec.com')).toBeNull();
    expect(tenantSlugFromHostname('a.b.dentairec.com')).toBeNull();
    expect(tenantSlugFromHostname('hala-clinic.vercel.app')).toBeNull();
    expect(tenantSlugFromHostname('')).toBeNull();
  });

  it('builds the fully-qualified tenant host', () => {
    expect(clinicSubdomain('hala-clinic')).toBe('hala-clinic.dentairec.com');
  });

  it('validates DNS-safe labels', () => {
    expect(isValidTenantSlug('hala-clinic')).toBe(true);
    expect(isValidTenantSlug('-bad')).toBe(false);
    expect(isValidTenantSlug('bad-')).toBe(false);
    expect(isValidTenantSlug('UPPER')).toBe(false);
    expect(isValidTenantSlug('a'.repeat(32))).toBe(false);
  });

  it('reserved set covers every reserved public slug', () => {
    for (const reserved of ['api', 'dashboard', 'book', 'portal', 'setup']) {
      expect(RESERVED_SUBDOMAINS.has(reserved)).toBe(true);
    }
  });

  it('reserves EVERY static route directly under app/ (invariant)', () => {
    // Why this test exists: a tenant slug colliding with a static route is
    // shadowed by that route at `/{slug}` (unreachable tenant space) AND its
    // subdomain label is wrongly treated as a tenant by the middleware, so
    // `login.dentairec.com` would serve a clinic. Four routes were missing when
    // the subdomain layer shipped. The list is derived from the filesystem, so
    // adding a route without reserving its slug fails HERE, not in production.
    const segments = staticRouteSegments();
    // Guard against a vacuous pass: if the derivation silently returned
    // nothing (wrong cwd, renamed folder), the equality below would be trivially
    // green and the invariant would protect nothing.
    expect(segments.length).toBeGreaterThan(10);
    const missing = segments.filter((segment) => !RESERVED_PUBLIC_SLUGS.has(segment));
    expect(
      missing,
      `static routes missing from RESERVED_PUBLIC_SLUGS: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('reserved subdomains are a superset of the reserved public slugs', () => {
    const missing = Array.from(RESERVED_PUBLIC_SLUGS).filter(
      (slug) => !RESERVED_SUBDOMAINS.has(slug)
    );
    expect(missing, `reserved slugs not reserved as subdomains: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('tenant path rewrite', () => {
  it('maps ONLY the tenant root to the tenant space', () => {
    expect(tenantPathRewrite('hala-clinic', '/')).toBe('/hala-clinic');
  });

  it('leaves platform routes untouched so patient journeys keep working', () => {
    // Regression: the clinic space renders its booking CTA as the RELATIVE
    // `/book?slug=…`. Prefixing it produced `/{slug}/book` (no such route), so
    // every patient landing on the subdomain got a 404 when clicking "book".
    expect(tenantPathRewrite('hala-clinic', '/book')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/discover')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/ask')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/c/hala-clinic')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/d/some-doctor')).toBeNull();
  });

  it('never rewrites platform branches', () => {
    expect(tenantPathRewrite('hala-clinic', '/api/clinic/services')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/dashboard')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/dashboard/patients')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/admin')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/login')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/portal/x')).toBeNull();
  });

  it('never rewrites file-like paths (crawler + static surfaces)', () => {
    // Regression: these were rewritten to /{slug}/robots.txt → 404, hiding the
    // platform's crawler files from tenant hosts.
    expect(tenantPathRewrite('hala-clinic', '/robots.txt')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/sitemap.xml')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/llms.txt')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/5e754e705e92a8b07dbe595c930ea146.txt')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/icons/icon-512.png')).toBeNull();
  });

  it('does not double-rewrite an already prefixed path', () => {
    expect(tenantPathRewrite('hala-clinic', '/hala-clinic/')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/hala-clinic/about')).toBeNull();
  });
});

describe('canonical tenant URL (Phase E)', () => {
  it('builds the tenant subdomain URL — the single canonical identity', () => {
    expect(clinicSpaceUrl('hala-clinic')).toBe('https://hala-clinic.dentairec.com');
    expect(clinicSpaceUrl('amal-x-ray-center')).toBe('https://amal-x-ray-center.dentairec.com');
    // Slugs are normalized first, so casing/whitespace can never split identity.
    expect(clinicSpaceUrl(' HALA-CLINIC ')).toBe('https://hala-clinic.dentairec.com');
  });

  it('never emits a malformed host for a slug that cannot be a DNS label', () => {
    // Such slugs cannot exist in the DB (registration validates charset +
    // reserved list), but a slug must never be able to inject a host or a path.
    expect(clinicSpaceUrl('a b')).toBe('https://www.dentairec.com/a%20b');
    expect(clinicSpaceUrl('evil.com/x')).toBe('https://www.dentairec.com/evil.com%2Fx');
    expect(clinicSpaceUrl('app')).toBe('https://www.dentairec.com/app'); // reserved label
  });
});

describe('legacy URL → canonical subdomain redirect', () => {
  it('candidates the apex path of a tenant-looking slug', () => {
    expect(tenantRedirect('www.dentairec.com', '/hala-clinic')).toEqual({
      kind: 'apex-path',
      slug: 'hala-clinic',
    });
    // Trailing slash / casing / port are the same page.
    expect(tenantRedirect('dentairec.com', '/hala-clinic/')).toEqual({
      kind: 'apex-path',
      slug: 'hala-clinic',
    });
    expect(tenantRedirect('www.dentairec.com:3000', '/Hala-Clinic')).toEqual({
      kind: 'apex-path',
      slug: 'hala-clinic',
    });
  });

  it('never candidates platform routes, crawler files or deep links', () => {
    const untouched = [
      '/',
      '/book',
      '/discover',
      '/ask',
      '/login',
      '/register',
      '/dashboard',
      '/dashboard/patients',
      '/admin',
      '/portal/x',
      '/c/hala-clinic',
      '/d/dr-ahmad',
      '/q/pub_x',
      '/llms.txt',
      '/robots.txt',
      '/sitemap.xml',
      '/5e754e705e92a8b07dbe595c930ea146.txt',
    ];
    for (const path of untouched) {
      expect(tenantRedirect('www.dentairec.com', path), path).toBeNull();
    }
    // Encoded separators must not smuggle a second segment into the host.
    expect(tenantRedirect('www.dentairec.com', '/%2Fetc')).toBeNull();
    expect(tenantRedirect('www.dentairec.com', '/a%2Fb')).toBeNull();
  });

  it('maps www.<slug> hosts to the bare subdomain (host-level, no lookup)', () => {
    expect(tenantRedirect('www.hala-clinic.dentairec.com', '/book')).toEqual({
      kind: 'host',
      host: 'hala-clinic.dentairec.com',
    });
    expect(tenantRedirect('www.hala-clinic.dentairec.com:3000', '/x')).toEqual({
      kind: 'host',
      host: 'hala-clinic.dentairec.com',
    });
  });

  it('does nothing for already-canonical or non-platform hosts', () => {
    expect(tenantRedirect('hala-clinic.dentairec.com', '/hala-clinic')).toBeNull();
    expect(tenantRedirect('dentairec.com', '/')).toBeNull();
    expect(tenantRedirect('staging.dentairec.com', '/hala-clinic')).toBeNull();
    expect(tenantRedirect('hala-clinic.vercel.app', '/hala-clinic')).toBeNull();
    expect(tenantRedirect('', '/hala-clinic')).toBeNull();
    expect(tenantRedirect('www.dentairec.com', '/hala-clinic')).not.toBeNull();
  });

  it('parses apex tenant slugs symmetrically with the middleware rewrite', () => {
    expect(apexTenantSlugFromPath('/hala-clinic')).toBe('hala-clinic');
    expect(apexTenantSlugFromPath('hala-clinic')).toBe('hala-clinic');
    expect(apexTenantSlugFromPath('/hala-clinic?utm=1')).toBe('hala-clinic');
    expect(apexTenantSlugFromPath('/hala-clinic/')).toBe('hala-clinic');
    expect(apexTenantSlugFromPath('/hala-clinic/team')).toBeNull();
    expect(apexTenantSlugFromPath('/')).toBeNull();
    expect(apexTenantSlugFromPath('/%')).toBeNull();
  });
});
