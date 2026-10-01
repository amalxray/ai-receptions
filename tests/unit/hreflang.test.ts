import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMetadata as generateDoctorMetadata } from '@/app/d/[slug]/page';
import { buildHreflangLinks } from '@/lib/seo/hreflang';

const mockProfile = vi.hoisted(() => ({ profile: null as any }));

vi.mock('@/lib/services/doctorPublicProfile', () => ({
  getDoctorPublicProfile: vi.fn(async () => mockProfile.profile),
  doctorPublicUrl: (slug: string) => `https://example.com/d/${slug}`,
}));

describe('hreflang metadata', () => {
  beforeEach(() => {
    mockProfile.profile = {
      slug: 'dr-ahmad',
      name: 'Dr. Ahmad',
      title: 'Dentist',
      specialty: 'General Dentistry',
      bio: 'Bio',
      photo_url: null,
      visibility: 'indexable',
      clinic: {
        name: 'Demo Clinic',
        slug: 'demo-clinic',
        city: 'Amman',
        area: null,
        address: null,
        phone: null,
        pageUrl: 'https://example.com/c/demo-clinic',
      },
      services: [],
      workingHours: [],
      bookingUrl: '/book?slug=demo-clinic',
      chatUrl: '/chat?clinic=demo-clinic',
      pageUrl: 'https://example.com/d/dr-ahmad',
    };
  });

  it('injects ar and x-default for public indexable doctor pages', async () => {
    const meta = await generateDoctorMetadata({ params: { slug: 'dr-ahmad' } });
    expect(meta.alternates?.languages).toEqual({
      ar: 'https://example.com/d/dr-ahmad',
      'x-default': 'https://example.com/d/dr-ahmad',
    });
  });

  it('omits hreflang when the public profile is noindex', async () => {
    mockProfile.profile = { ...mockProfile.profile, visibility: 'noindex' };
    const meta = await generateDoctorMetadata({ params: { slug: 'dr-ahmad' } });
    expect(meta.alternates?.languages).toBeUndefined();
  });

  it('builds canonical hreflang records for public pages', () => {
    expect(buildHreflangLinks('https://example.com/c/demo-clinic')).toEqual({
      ar: 'https://example.com/c/demo-clinic',
      'x-default': 'https://example.com/c/demo-clinic',
    });
  });
});
