'use client';

import { motion } from 'framer-motion';
import type { PublicReviewItem } from '@/lib/services/reviewsService';

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export default function PatientReviewCard({ review }: { review: PublicReviewItem }) {
  return (
    <motion.li
      variants={cardVariants}
      whileHover={{
        y: -5,
        boxShadow: '0 26px 60px rgba(2, 6, 23, 0.55), 0 0 24px rgba(251, 191, 36, 0.1)',
      }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      className="group relative flex h-full min-w-0 flex-col gap-3 overflow-hidden rounded-3xl border border-amber-400/20 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-slate-800/80 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur-md sm:p-6"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-0 font-serif text-8xl leading-none text-amber-300/10"
      >
        “
      </span>

      <div className="relative flex items-center justify-between gap-3">
        <span
          className="inline-flex text-amber-400 drop-shadow-md transition-[filter] duration-300 group-hover:drop-shadow-[0_0_9px_rgba(251,191,36,0.8)]"
          role="img"
          aria-label={`${review.rating} من 5 نجوم`}
          dir="ltr"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <svg key={index} viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 sm:h-[18px] sm:w-[18px]">
              <path
                fill={index < review.rating ? 'currentColor' : '#475569'}
                d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.1l-4.94 2.6.94-5.5-4-3.9 5.53-.8z"
              />
            </svg>
          ))}
        </span>
        <time dateTime={review.created_at} className="shrink-0 text-xs tabular-nums text-slate-400" dir="ltr">
          {review.created_at.slice(0, 10)}
        </time>
      </div>

      {review.comment && (
        <blockquote className="relative flex-1 break-words text-sm leading-7 text-slate-200">
          {review.comment}
        </blockquote>
      )}

      <div className="relative mt-auto flex items-center gap-2 border-t border-white/10 pt-3">
        <span className="text-sm font-semibold text-slate-100">{review.author_name}</span>
        {review.is_verified && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3">
              <path fill="currentColor" d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.7 5.9l-4.4 4.4a.75.75 0 01-1.06 0L4.3 8.4a.75.75 0 111.06-1.06l1.44 1.44 3.87-3.87A.75.75 0 1111.7 5.9z" />
            </svg>
            موثّق
          </span>
        )}
      </div>
    </motion.li>
  );
}
