import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PP-8C — SEO Foundations tests: sitemap (indexable-only), robots, JSON-LD.
 * Visibility contract: private → 404 (no SEO surface at all) ·
 * noindex → reachable but excluded from indexable surfaces ·
 * indexable → the ONLY entries allowed into sitemap.
 */

const mockState = vi.hoisted(() => ({
  entries: [] as any[],
  activitySpaces: [] as any[],
  /** Vercel-registered hosts (readiness, P1). */
  hosts: ['demo-clinic.dentairec.com'] as string[],
}));
vi.mock('@/lib/services/doctorPublicProfile', () => ({
  getPublicProfileSeoEntries: vi.fn(async () => mockState.entries),
}));
vi.mock('@/lib/services/activityPublicSpace', () => ({
  getActivitySpaceEntries: vi.fn(async () => mockState.activitySpaces),
}));
vi.mock('@/lib/communications/links', () => ({
  getAppBaseUrl: () => 'https://clinics.example.com',
}));
// Readiness is Vercel-authoritative (P1) — the sitemap may only advertise a
// tenant subdomain whose host is actually registered on the project. Mirrored
// here so the test stays offline; the real client is covered by
// `subdomain-readiness.test.ts`.
vi.mock('@/lib/vercel/subdomainReadiness', () => ({
  readVercelProjectDomainNames: vi.fn(async () => new Set(mockState.hosts)),
  isSubdomainIn: (names: ReadonlySet<string> | null, slug: string) =>
    Boolean(names && names.has(`${slug}.dentairec.com`)),
}));

import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { buildDoctorJsonLd } from '@/lib/services/doctorJsonLd';
import type { DoctorPublicProfile } from '@/lib/services/doctorPublicProfile';

function baseProfile(overrides: Record<string, unknown> = {}): DoctorPublicProfile {
  return {
    slug: 'dr-ahmadhassan',
    name: 'Dr. Ahmad Hassan',
    title: 'Dentist (Demo)',
    specialty: 'طب الأسنان العام',
    bio: 'نبذة تجريبية',
    photo_url: 'https://cdn.example.com/dr.jpg',
    visibility: 'indexable',
    clinic: {
      name: 'Demo Dental Clinic',
      slug: 'demo-dental-clinic',
      city: 'عمّان',
      area: null,
      address: 'شارع المدينة',
      phone: '+970-555-0001',
      pageUrl: 'https://clinics.example.com/c/demo-dental-clinic',
    },
    services: [{ name: 'Dental Exam', description: null, duration_minutes: 30, price: 50, price_min: null, price_max: null }],
    workingHours: [{ weekday: 1, start_time: '09:00', end_time: '17:00' }],
    bookingUrl: '/book?slug=demo-dental-clinic',
    chatUrl: '/chat?clinic=demo-dental-clinic',
    pageUrl: 'https://clinics.example.com/d/dr-ahmadhassan',
    ...overrides,
  } as DoctorPublicProfile;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockState.entries = [];
  mockState.hosts = ['demo-clinic.dentairec.com'];
});

describe('PP-8C — sitemap.xml (indexable-only surface)', () => {
  it('lists platform surfaces + ONLY indexable entities (doctors under /d/, spaces on their subdomain)', async () => {
    mockState.entries = [
      { kind: 'doctor', slug: 'dr-indexable', lastModified: new Date('2026-09-01T00:00:00Z') },
    ];
    mockState.activitySpaces = [
      { kind: 'clinic', slug: 'demo-clinic', name: 'Demo Clinic', city: null, area: null },
    ];
    const result = await sitemap();
    const urls = result.map((e) => e.url);
    expect(urls).toContain('https://clinics.example.com/');
    expect(urls).toContain('https://clinics.example.com/d/dr-indexable');
    // Activity spaces are listed on their canonical tenant SUBDOMAIN (Phase E);
    // the legacy apex path 301-redirects there, so it must never be listed.
    expect(urls).toContain('https://demo-clinic.dentairec.com');
    expect(urls).not.toContain('https://clinics.example.com/demo-clinic');
    // Entity entries are ADDITIVE to the static platform surfaces (/book,
    // /discover, /ask + subpages, published articles) — the contract is
    // "indexable only", not a frozen entry count.
    expect(urls.length).toBeGreaterThanOrEqual(3);
    // Legacy /c/{slug} compatibility pages are noindex → never listed.
    expect(urls.filter((url) => url.includes('/c/'))).toEqual([]);
    const doctorEntry = result.find((e) => e.url?.includes('/d/'));
    expect(doctorEntry?.lastModified).toEqual(new Date('2026-09-01T00:00:00Z'));
  });

  it('noindex/private profiles are ABSENT (service contract returns indexable only)', async () => {
    mockState.entries = []; // service never returns noindex/private entries
    mockState.activitySpaces = [];
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain('https://clinics.example.com/');
    // No entity surface may be emitted for an empty service response.
    expect(urls.filter((url) => url.includes('/d/'))).toEqual([]);
    expect(urls.filter((url) => url.includes('.dentairec.com'))).toEqual([]);
  });
});

describe('PP-8C — robots.txt', () => {
  it('allows public surfaces, disallows operational areas, points at sitemap', () => {
    const rules = robots();
    const disallow = ['/dashboard/', '/admin/', '/portal/', '/api/'];
    // `MetadataRoute.Robots['rules']` is `Rules | Rules[]` (Next accepts a single
    // rule object as well as an array), so it must be narrowed before use —
    // `.find`/`.filter` only exist on the array form.
    const ruleList = Array.isArray(rules.rules) ? rules.rules : [rules.rules];
    const wildcard = ruleList.find((rule) => rule.userAgent === '*');
    expect(wildcard).toEqual({ userAgent: '*', allow: '/', disallow });

    // AEO/GEO: AI answer-engine crawlers get EXPLICIT allow rules over the same
    // public surface (and the same operational disallows) — blocking them would
    // defeat the AEO surface, and blocking noindex pages would hide their
    // noindex directive from crawlers.
    const answerEngines = ruleList.filter((rule) => rule.userAgent !== '*');
    expect(answerEngines.length).toBeGreaterThan(0);
    for (const rule of answerEngines) {
      expect(rule.allow).toBe('/');
      expect(rule.disallow).toEqual(disallow);
    }

    expect(rules.sitemap).toBe('https://clinics.example.com/sitemap.xml');
  });
});

describe('PP-8C — JSON-LD (built from the public projection only)', () => {
  it('emits Physician inside Dentist with clinic address/phone/hours/services', () => {
    const ld = buildDoctorJsonLd(baseProfile());
    expect(ld['@context']).toBe('https://schema.org');
    const graph = ld['@graph'] as any[];
    const physician = graph.find((n) => n['@type'] === 'Physician');
    const clinic = graph.find((n) => n['@type'] === 'Dentist');
    expect(physician.name).toBe('Dr. Ahmad Hassan');
    expect(physician.url).toBe('https://clinics.example.com/d/dr-ahmadhassan');
    expect(physician.image).toBe('https://cdn.example.com/dr.jpg');
    expect(physician.medicalSpecialty).toBe('طب الأسنان العام');
    expect(physician.worksFor['@id']).toBe(clinic['@id']);
    expect(clinic.address.addressLocality).toBe('عمّان');
    expect(clinic.telephone).toBe('+970-555-0001');
    expect(clinic.openingHoursSpecification[0].dayOfWeek).toBe('Monday');
    expect(clinic.makesOffer[0].itemOffered.name).toBe('Dental Exam');
  });

  it('omits phone/address/hours/services when not opted-in or empty (opt-in flags honored)', () => {
    const ld = buildDoctorJsonLd(baseProfile({
      clinic: { name: 'Demo Dental Clinic', slug: 'demo-dental-clinic', city: null, area: null, address: null, phone: null, pageUrl: 'https://clinics.example.com/c/demo-dental-clinic' },
      services: [],
      workingHours: [],
      photo_url: null,
      specialty: null,
    }));
    const graph = ld['@graph'] as any[];
    const physician = graph.find((n) => n['@type'] === 'Physician');
    const clinic = graph.find((n) => n['@type'] === 'Dentist');
    expect(clinic.telephone).toBeUndefined();
    expect(clinic.address).toBeUndefined();
    expect(clinic.openingHoursSpecification).toBeUndefined();
    expect(clinic.makesOffer).toBeUndefined();
    expect(physician.image).toBeUndefined();
    expect(physician.medicalSpecialty).toBeUndefined();
  });

  it('never leaks private data (email/user_id/provider uuid) into structured data', () => {
    const json = JSON.stringify(buildDoctorJsonLd(baseProfile()));
    expect(json).not.toMatch(/user_id|"email"|provider_id/i);
  });
});
