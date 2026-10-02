import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMetadata } from '@/app/c/[slug]/page';

// Legacy /c/[slug] compatibility page should resolve via the dynamic activity-space
// contract used by the canonical public route.

const mockState = vi.hoisted(() => ({ space: null as any }));

vi.mock('@/lib/services/activityPublicSpace', () => ({
  getActivityPublicSpace: vi.fn(async () => mockState.space),
  activitySpaceUrl: (slug: string) => `https://${slug}.dentairec.com`,
}));
vi.mock('next/navigation', () => ({ notFound: vi.fn() }));

describe('15D — /c/[slug] generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.space = {
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'demo-clinic',
      name: 'Demo Clinic',
      description: 'عيادة نموذجية',
      logo: null,
      city: 'عمّان',
      area: null,
      address: null,
      phone: null,
      pageUrl: 'https://demo-clinic.dentairec.com',
      socialLinks: {},
      theme: { primary_color: '#273f7c', background_color: '#f6f8ff' },
      services: [],
      workingHours: [],
      bookingUrl: '/book?slug=demo-clinic',
      activityType: 'clinic',
    };
  });

  it('returns the clinic name, description, OG and canonical for a resolved clinic', async () => {
    const meta = await generateMetadata({ params: { slug: 'demo-clinic' } });
    expect(meta.title).toBe('Demo Clinic');
    expect(meta.description).toBe('عيادة نموذجية');
    expect(meta.openGraph?.title).toBe('Demo Clinic');
    expect(meta.alternates?.canonical).toBe('https://demo-clinic.dentairec.com');
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('falls back to a not-found title when the clinic does not resolve', async () => {
    mockState.space = null;
    const meta = await generateMetadata({ params: { slug: 'missing' } });
    expect(meta.title).toBe('العيادة غير موجودة');
  });
});