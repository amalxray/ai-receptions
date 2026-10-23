import React from 'react';
import type { PublicReviewItem, ReviewStats } from '@/lib/services/reviewsService';
import ReviewsPageClient from '@/app/[slug]/reviews/ReviewsPageClient';

/**
 * PHASE 2 — patient reviews block for public tenant pages (server component).
 * Average + 1–5 distribution + latest review cards. RTL, WCAG AA contrast.
 * Renders nothing when there are no published reviews (defensive — the page
 * only mounts it above zero anyway).
 */

function Stars({ rating, className = '' }: { rating: number; className?: string }) {
  return (
    <span
      className={`inline-flex ${className}`}
      role="img"
      aria-label={`${rating} من 5 نجوم`}
      dir="ltr"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <svg key={star} viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
          <path
            fill={star <= rating ? 'currentColor' : '#cbd5e1'}
            d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.1l-4.94 2.6.94-5.5-4-3.9 5.53-.8z"
          />
        </svg>
      ))}
    </span>
  );
}

function DistributionRow({ stars, count, total }: { stars: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <li className="flex items-center gap-2 text-sm text-slate-600">
      <span className="w-8 shrink-0 text-slate-500" dir="ltr">{stars} ★</span>
      <span className="h-2 w-full max-w-40 overflow-hidden rounded-full bg-slate-200">
        <span
          className="block h-2 rounded-full bg-amber-400"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </span>
      <span className="w-10 shrink-0 tabular-nums" aria-label={`${count} تقييم`}>{count}</span>
    </li>
  );
}

export default function ReviewsSection({
  clinicName,
  clinicSlug,
  stats,
  items,
  viewAllHref,
  hideViewAll = false,
  maxItems = 3,
}: {
  clinicName: string;
  /** Tenant slug for the permanent review form (source='public'). Missing → button hidden (fail-silent). */
  clinicSlug?: string | null;
  stats: ReviewStats;
  items: PublicReviewItem[];
  /** Phase 3b — link to /{slug}/reviews. Shown only when total > 5. */
  viewAllHref?: string;
  /** Phase 3b — the full page reuses this section; it hides its own link. */
  hideViewAll?: boolean;
  /** Maximum number of review cards shown in this section. */
  maxItems?: number;
}) {
  const hasReviews = stats && stats.total > 0;
  const visibleItems = items.slice(0, maxItems);

  return (
    <section
      aria-labelledby="reviews-heading"
      className="border-t border-slate-200 bg-white px-4 py-12 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="reviews-heading" className="text-2xl font-bold text-slate-900">
              ماذا يقول مرضانا
            </h2>
            <p className="mt-1 text-sm text-slate-500">آراء مراجعي {clinicName}</p>
          </div>
          {clinicSlug ? <ReviewsPageClient clinicSlug={clinicSlug} /> : null}
        </div>

        {!hasReviews ? (
          <p className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            لا توجد تقييمات منشورة بعد — كن أول من يقيّم.
          </p>
        ) : (
          <>
            <div className="mt-6 grid gap-8 sm:grid-cols-[auto,1fr] sm:items-start">
          {/* Average */}
          <div className="flex flex-col items-center rounded-3xl border border-slate-200 bg-slate-50 px-8 py-6 text-center">
            <span className="text-5xl font-extrabold tabular-nums text-slate-900" dir="ltr">
              {stats.average.toFixed(1)}
            </span>
            <Stars rating={Math.round(stats.average)} className="mt-2 text-amber-500" />
            <span className="mt-2 text-sm text-slate-600" role="status">
              {stats.total} تقييم
            </span>
          </div>

          {/* Distribution */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700">توزيع التقييمات</h3>
            <ul className="mt-3 space-y-2" aria-label="توزيع التقييمات من 1 إلى 5">
              {[5, 4, 3, 2, 1].map((stars) => (
                <DistributionRow
                  key={stars}
                  stars={stars}
                  count={stats.distribution[String(stars) as '1' | '2' | '3' | '4' | '5']}
                  total={stats.total}
                />
              ))}
            </ul>
          </div>
        </div>

        {/* Latest reviews */}
        {visibleItems.length > 0 && (
          <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="آخر التقييمات">
            {visibleItems.map((item) => (
              <li
                key={item.id}
                className="flex h-full min-w-0 flex-col gap-2 overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <Stars rating={item.rating} className="text-amber-500" />
                  <time
                    dateTime={item.created_at}
                    className="text-xs text-slate-400 tabular-nums"
                    dir="ltr"
                  >
                    {item.created_at.slice(0, 10)}
                  </time>
                </div>
                {item.comment && (
                  <p className="break-words text-sm leading-relaxed text-slate-700">{item.comment}</p>
                )}
                <div className="mt-auto flex items-center gap-2 pt-1">
                  <span className="text-sm font-semibold text-slate-800">{item.author_name}</span>
                  {item.is_verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3">
                        <path fill="currentColor" d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.7 5.9l-4.4 4.4a.75.75 0 01-1.06 0L4.3 8.4a.75.75 0 111.06-1.06l1.44 1.44 3.87-3.87A.75.75 0 1111.7 5.9z" />
                      </svg>
                      موثّق
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {/* Phase 3b — link to the full reviews page (only when more than shown). */}
        {!hideViewAll && viewAllHref && stats.total > 5 && (
          <div className="mt-6 text-center">
            <a
              href={viewAllHref}
              className="inline-block rounded-full border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-700 hover:border-amber-400 hover:bg-amber-50"
            >
              عرض كل التقييمات ({stats.total})
            </a>
          </div>
        )}
          </>
        )}
      </div>
    </section>
  );
}
