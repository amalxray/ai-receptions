'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { clinicArticleExcerpt, cleanClinicArticleTitle } from '@/lib/services/clinicArticleText';

type ClinicArticleCardProps = {
  article: {
    id: string;
    title: string;
    category: string | null;
    content: string | null;
    image_url: string | null;
    published_at: string | null;
  };
  href: string;
  fallbackImage: string | null;
};

export default function ClinicArticleCard({ article, href, fallbackImage }: ClinicArticleCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = article.image_url || fallbackImage;
  const title = cleanClinicArticleTitle(article.title);

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="group overflow-hidden rounded-2xl border border-white/80 bg-white/75 shadow-sm backdrop-blur-md transition-shadow duration-500 hover:shadow-xl hover:shadow-emerald-900/10"
    >
      <Link href={href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset">
        <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-emerald-100 via-cyan-50 to-white">
          {imageUrl && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={title}
              loading="lazy"
              onError={() => setImageFailed(true)}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-emerald-100 via-cyan-50 to-white text-5xl text-emerald-700" aria-hidden="true">
              🦷
            </div>
          )}
          {article.category && (
            <span className="absolute right-3 top-3 rounded-full border border-white/70 bg-white/85 px-3 py-1 text-xs font-semibold text-emerald-800 shadow-sm backdrop-blur">
              {article.category}
            </span>
          )}
        </div>

        <div className="flex min-h-48 flex-col p-5 text-right" dir="rtl">
          <motion.h3
            whileHover={{ x: 2 }}
            className="text-lg font-bold leading-7 text-slate-900 transition-colors duration-300 group-hover:text-emerald-700"
          >
            {title}
          </motion.h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
            {clinicArticleExcerpt(article.content)}
          </p>
          {article.published_at && (
            <time dateTime={article.published_at} className="mt-3 text-xs text-slate-400">
              {new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(article.published_at))}
            </time>
          )}
          <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-bold text-emerald-700 transition-colors group-hover:text-cyan-700">
            اقرأ المزيد
            <span className="transition-transform duration-300 group-hover:-translate-x-1" aria-hidden="true">←</span>
          </span>
        </div>
      </Link>
    </motion.article>
  );
}
