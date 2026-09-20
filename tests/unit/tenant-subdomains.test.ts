import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  TENANT_ROOT_DOMAIN,
  RESERVED_SUBDOMAINS,
  clinicSubdomain,
  isValidTenantSlug,
  tenantPathRewrite,
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
