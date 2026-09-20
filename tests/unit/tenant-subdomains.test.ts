import { describe, it, expect } from 'vitest';
import {
  TENANT_ROOT_DOMAIN,
  RESERVED_SUBDOMAINS,
  clinicSubdomain,
  isFileLikePath,
  isValidTenantSlug,
  tenantPathRewrite,
  tenantSlugFromHostname,
} from '@/lib/vercel/domains';

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
});

describe('tenant path rewrite', () => {
  it('rewrites the root and public paths to the tenant space', () => {
    expect(tenantPathRewrite('hala-clinic', '/')).toBe('/hala-clinic');
    expect(tenantPathRewrite('hala-clinic', '/book')).toBe('/hala-clinic/book');
    expect(tenantPathRewrite('hala-clinic', '/discover')).toBe('/hala-clinic/discover');
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
    // Regression: these used to be rewritten to /{slug}/robots.txt → 404,
    // hiding the platform's crawler files from tenant hosts.
    expect(tenantPathRewrite('hala-clinic', '/robots.txt')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/sitemap.xml')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/llms.txt')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/5e754e705e92a8b07dbe595c930ea146.txt')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/icons/icon-512.png')).toBeNull();
    expect(isFileLikePath('/robots.txt')).toBe(true);
    expect(isFileLikePath('/logo.svg')).toBe(true);
    expect(isFileLikePath('/book')).toBe(false);
    expect(isFileLikePath('/')).toBe(false);
  });

  it('does not double-rewrite an already prefixed path', () => {
    expect(tenantPathRewrite('hala-clinic', '/hala-clinic/')).toBeNull();
    expect(tenantPathRewrite('hala-clinic', '/hala-clinic/about')).toBeNull();
  });
});
