import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMetadata } from '@/app/c/[slug]/page';
import { activitySpaceUrl } from '@/lib/services/activityPublicSpace';

// STEP 15D — /c/[slug] public page metadata (SEO/OG).

const mockState = vi.hoisted(() => ({ profile: null as any }));
// Mocks mirror the production shapes: the canonical clinic URL is the tenant
// SUBDOMAIN (Phase E); the flat `/c/{slug}` path is the legacy compat route.
vi.mock('@/lib/services/activityPublicSpace', () => ({
  activitySpaceUrl: (slug: string) => `https://${slug}.dentairec.com`,
}));
vi.mock('@/lib/services/clinicPublicProfile', () => ({
  getPublicClinicProfile: vi.fn(async () => mockState.profile),
  publicClinicUrl: (slug: string) => `https://${slug}.dentairec.com`,
}));
vi.mock('next/navigation', () => ({ notFound: vi.fn() }));

describe('15D — /c/[slug] generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.profile = {
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'demo-clinic',
      name: 'Demo Clinic',
      description:
        'عيادة نموذجية',
      logo: null,
      city: 'عمّان',
      area: null,
      address: null,
      phone: null,
      services: [],
      workingHours: [],
      bookingUrl: '/book?slug=demo-clinic',
      chatUrl: '/chat?clinic=demo-clinic',
      pageUrl: 'https://demo-clinic.dentairec.com',
    };
  });

  it('returns the clinic name, description, OG and canonical for a resolved clinic', async () => {
    const meta = await generateMetadata({ params: { slug: 'demo-clinic' } });
    expect(meta.title).toBe('Demo Clinic');
    expect(meta.description).toBe('عيادة نموذجية');
    expect(meta.openGraph?.title).toBe('Demo Clinic');
    expect(meta.alternates?.canonical).toBe('https://demo-clinic.dentairec.com');
    // Phase E legacy compat: /c is noindex (canonical identity is the subdomain)
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('falls back to a not-found title when the clinic does not resolve', async () => {
    mockState.profile = null;
    const meta = await generateMetadata({ params: { slug: 'missing' } });
    expect(meta.title).toBe('العيادة غير موجودة');
  });
});