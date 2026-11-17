import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata } from '@/app/[slug]/reviews/page';

const mockState = vi.hoisted(() => ({
  space: null as { slug: string; name: string; logo: string | null; pageUrl: string } | null,
}));

vi.mock('@/lib/services/activityPublicSpace', () => ({
  getActivityPublicSpace: vi.fn(async () => mockState.space),
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
    mockState.space = {
      slug: 'amal-x-ray-center',
      name: 'مركز أمل لتصوير الأسنان والفكين',
      logo: '/images/amal-logo.webp',
      pageUrl: 'https://amal-x-ray-center.dentairec.com',
    };
  });

  it('uses the Amal logo in Facebook and Twitter preview metadata', async () => {
    const meta = await generateMetadata({ params: { slug: 'amal-x-ray-center' } });

    expect(meta.openGraph).toMatchObject({
      title: 'تقييمات المرضى — مركز أمل لتصوير الأسنان والفكين',
      description: 'آراء وتقييمات المرضى في مركز أمل لتصوير الأسنان والفكين.',
      url: 'https://amal-x-ray-center.dentairec.com/reviews',
      type: 'website',
      images: [{ url: '/images/amal-logo.webp', alt: 'مركز أمل لتصوير الأسنان والفكين' }],
    });
    expect(meta.twitter).toMatchObject({
      card: 'summary',
      title: 'تقييمات المرضى — مركز أمل لتصوير الأسنان والفكين',
      description: 'آراء وتقييمات المرضى في مركز أمل لتصوير الأسنان والفكين.',
      images: ['/images/amal-logo.webp'],
    });
  });

  it('does not change social metadata for other clinics', async () => {
    mockState.space = {
      ...mockState.space,
      slug: 'other-clinic',
      logo: '/images/other-logo.webp',
      pageUrl: 'https://other-clinic.dentairec.com',
    };

    const meta = await generateMetadata({ params: { slug: 'other-clinic' } });

    expect(meta.openGraph).toBeUndefined();
    expect(meta.twitter).toBeUndefined();
  });
});
