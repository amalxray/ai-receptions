import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActivityPublicSpace } from '@/lib/services/activityPublicSpace';
import { requestCache } from '@/lib/server/requestCache';
import {
  buildClinicReviewsJsonLd,
  getClinicReviewsPage,
  getClinicReviewsStats,
} from '@/lib/services/reviewsService';
import ReviewsSection from '@/components/public/ReviewsSection';
import ReviewsPageClient from './ReviewsPageClient';

/**
 * Phase 3b — full public reviews page: /{slug}/reviews.
 * Server component: paginated published reviews (20/page) + JSON-LD
 * (AggregateRating + up to 10 latest Review nodes, same Phase-2 logic).
 * The write-a-review form lives in ReviewsPageClient (source='public').
 */

export const revalidate = 60;

const PAGE_SIZE = 20;

const loadSpace = requestCache(getActivityPublicSpace);

type PageProps = { params: { slug: string }; searchParams?: { page?: string } };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const space = await loadSpace(params.slug);
  if (!space) return { title: 'غير موجودة', robots: { index: false, follow: false } };
  return {
    title: `تقييمات المرضى — ${space.name}`,
    description: `آراء وتقييمات المرضى في ${space.name}.`,
    alternates: { canonical: `${space.pageUrl}/reviews` },
  };
}

export default async function ClinicReviewsPage({ params, searchParams }: PageProps) {
  const space = await loadSpace(params.slug);
  if (!space) notFound();

  const rawPage = Number(searchParams?.page ?? '1');
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const [stats, { items, total }] = await Promise.all([
    getClinicReviewsStats(space.clinicId),
    getClinicReviewsPage(space.clinicId, offset, PAGE_SIZE),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const reviewsLd = buildClinicReviewsJsonLd({
    clinic: { name: space.name, url: `${space.pageUrl}/reviews` },
    stats,
    items,
  });

  const basePath = `/${params.slug}/reviews`;

  return (
    <>
      {reviewsLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewsLd).replace(/</g, '\\u003c') }}
        />
      )}
      <main dir="rtl" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <nav aria-label="مسار التنقل" className="mb-6 text-sm text-slate-500">
          <Link href={`/${params.slug}`} className="hover:underline">
            {space.name}
          </Link>
          <span aria-hidden="true"> ← </span>
          <span aria-current="page">التقييمات</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900">تقييمات المرضى — {space.name}</h1>
          <ReviewsPageClient clinicSlug={params.slug} />
        </div>

        <div className="mt-6">
          <ReviewsSection clinicName={space.name} stats={stats} items={items} hideViewAll maxItems={PAGE_SIZE} />
        </div>

        {stats.total === 0 && (
          <p className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            لا توجد تقييمات منشورة بعد — كن أول من يقيّم.
          </p>
        )}

        {totalPages > 1 && (
          <nav aria-label="صفحات التقييمات" className="mt-8 flex flex-wrap items-center justify-center gap-2">
            {page > 1 && (
              <Link
                href={`${basePath}?page=${page - 1}`}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                السابق
              </Link>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={`${basePath}?page=${p}`}
                aria-current={p === page ? 'page' : undefined}
                className={`rounded-full px-4 py-2 text-sm font-semibold tabular-nums ${
                  p === page ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p}
              </Link>
            ))}
            {page < totalPages && (
              <Link
                href={`${basePath}?page=${page + 1}`}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                التالي
              </Link>
            )}
          </nav>
        )}
      </main>
    </>
  );
}
