import React from 'react';
import { motion } from 'framer-motion';
import type { PublicReviewItem, ReviewStats } from '@/lib/services/reviewsService';
import ReviewsPageClient from '@/app/[slug]/reviews/ReviewsPageClient';
import PatientReviewCard from './PatientReviewCard';

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
            fill={star <= rating ? 'currentColor' : '#475569'}
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
    <li className="flex items-center gap-2 text-sm text-slate-300">
      <span className="w-8 shrink-0 text-slate-300" dir="ltr">{stars} ★</span>
      <span className="h-2 w-full max-w-40 overflow-hidden rounded-full bg-slate-700">
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
  maxItems = 6,
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
      className="border-t border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="reviews-heading" className="text-2xl font-bold text-white">
              ماذا يقول مرضانا
            </h2>
            <p className="mt-1 text-sm text-slate-300">آراء مراجعي {clinicName}</p>
          </div>
          {clinicSlug ? <ReviewsPageClient clinicSlug={clinicSlug} /> : null}
        </div>

        {!hasReviews ? (
          <p className="mt-6 rounded-2xl border border-dashed border-slate-600 bg-slate-900/60 px-4 py-6 text-center text-sm text-slate-300">
            لا توجد تقييمات منشورة بعد — كن أول من يقيّم.
          </p>
        ) : (
          <>
            <div className="mt-6 grid gap-8 sm:grid-cols-[auto,1fr] sm:items-start">
          {/* Average */}
          <div className="flex flex-col items-center rounded-3xl border border-white/10 bg-white/5 px-8 py-6 text-center shadow-xl shadow-black/10 backdrop-blur-md">
            <span className="text-5xl font-extrabold tabular-nums text-white" dir="ltr">
              {stats.average.toFixed(1)}
            </span>
            <Stars rating={Math.round(stats.average)} className="mt-2 text-amber-400 drop-shadow-md" />
            <span className="mt-2 text-sm text-slate-300" role="status">
              {stats.total} تقييم
            </span>
          </div>

          {/* Distribution */}
          <div>
            <h3 className="text-sm font-semibold text-slate-200">توزيع التقييمات</h3>
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
          <motion.ul
            className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
            aria-label="آخر التقييمات"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
          >
            {visibleItems.map((item) => (
              <PatientReviewCard key={item.id} review={item} />
            ))}
          </motion.ul>
        )}
        {/* Phase 3b — link to the full reviews page (only when more than shown). */}
        {!hideViewAll && viewAllHref && stats.total > 5 && (
          <div className="mt-6 text-center">
            <a
              href={viewAllHref}
              className="inline-block rounded-full border border-white/20 px-6 py-2.5 text-sm font-semibold text-slate-100 transition-colors hover:border-amber-400 hover:bg-amber-400 hover:text-slate-950"
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
