import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata } from '@/app/[slug]/reviews/page';

const mockState = vi.hoisted(() => ({
  spaces: {} as Record<string, {
    slug: string;
    name: string;
    logoSourceUrl: string | null;
    pageUrl: string;
  }>,
}));

vi.mock('@/lib/services/activityPublicSpace', () => ({
  getActivityPublicSpace: vi.fn(async (slug: string) => mockState.spaces[slug] ?? null),
}));
vi.mock('@/lib/server/requestCache', () => ({
  requestCache: (fn: unknown) => fn,
}));
vi.mock('@/lib/services/reviewsService', () => ({
  buildClinicReviewsJsonLd: vi.fn(),
  getClinicReviewsPage: vi.fn(),
  getClinicReviewsStats: vi.fn(),
}));
vi.mock('@/components/public/ReviewsSection', () => ({ default: () => null }));
vi.mock('@/app/[slug]/reviews/ReviewsPageClient', () => ({ default: () => null }));
vi.mock('next/navigation', () => ({ notFound: vi.fn() }));

describe('/[slug]/reviews generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.spaces = {
      'amal-x-ray-center': {
        slug: 'amal-x-ray-center',
        name: 'مركز أمل لتصوير الأسنان والفكين',
        logoSourceUrl:
          'https://ixlsrurenboseoelwixs.supabase.co/storage/v1/object/public/clinic-public-media/clinic/14f6ad3a-f9bf-4108-a809-7e96ad3e2bf5/public-media/4e48861e-f2d4-4fbc-a42b-723d55065650.png',
        pageUrl: 'https://amal-x-ray-center.dentairec.com',
      },
    };
  });

  it('uses the exact saved logo URL for any clinic in Facebook and Twitter metadata', async () => {
    const amalLogoUrl = mockState.spaces['amal-x-ray-center'].logoSourceUrl;
    const amalMeta = await generateMetadata({ params: { slug: 'amal-x-ray-center' } });

    expect(amalMeta.openGraph).toMatchObject({
      images: [{ url: amalLogoUrl }],
    });
    expect(amalMeta.twitter).toMatchObject({ images: [amalLogoUrl] });

    mockState.spaces['another-clinic'] = {
      slug: 'another-clinic',
      name: 'Another Clinic',
      logoSourceUrl: 'https://storage.example/clinic/another/logo.png',
      pageUrl: 'https://another-clinic.dentairec.com',
    };
    const meta = await generateMetadata({ params: { slug: 'another-clinic' } });

    expect(meta.openGraph).toMatchObject({
      title: 'تقييمات المرضى — Another Clinic',
      description: 'آراء وتقييمات المرضى في Another Clinic.',
      url: 'https://another-clinic.dentairec.com/reviews',
      type: 'website',
      images: [{ url: 'https://storage.example/clinic/another/logo.png', alt: 'Another Clinic' }],
    });
    expect(meta.twitter).toMatchObject({
      card: 'summary',
      title: 'تقييمات المرضى — Another Clinic',
      description: 'آراء وتقييمات المرضى في Another Clinic.',
      images: ['https://storage.example/clinic/another/logo.png'],
    });
  });

  it('uses the generic image only when that clinic has no saved logo', async () => {
    mockState.spaces['amal-x-ray-center'].logoSourceUrl = null;

    const meta = await generateMetadata({ params: { slug: 'amal-x-ray-center' } });

    expect(meta.openGraph).toMatchObject({
      images: [{
        url: 'https://www.dentairec.com/og-image.png',
        alt: 'AI-Receptions — موظفة الاستقبال الرقمية لعيادتك',
      }],
    });
    expect(meta.twitter).toMatchObject({ images: ['https://www.dentairec.com/og-image.png'] });
  });

  it('uses the latest logo URL on regeneration after a clinic replaces its logo', async () => {
    mockState.spaces['amal-x-ray-center'].logoSourceUrl = 'https://storage.example/clinic/amal/old-logo.png';
    const before = await generateMetadata({ params: { slug: 'amal-x-ray-center' } });

    mockState.spaces['amal-x-ray-center'].logoSourceUrl = 'https://storage.example/clinic/amal/new-logo.png';
    const after = await generateMetadata({ params: { slug: 'amal-x-ray-center' } });

    expect(before.openGraph).toMatchObject({
      images: [{ url: 'https://storage.example/clinic/amal/old-logo.png' }],
    });
    expect(after.openGraph).toMatchObject({
      images: [{ url: 'https://storage.example/clinic/amal/new-logo.png' }],
    });
  });
});
