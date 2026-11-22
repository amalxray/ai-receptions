'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import Image from 'next/image';

const SalesChatExperience = lazy(() => import('./SalesChatExperience'));

export default function SalesChatWidget() {
  const [active, setActive] = useState(false);
  const [showTeaser, setShowTeaser] = useState(false);

  useEffect(() => {
    if (active || window.sessionStorage.getItem('sales-chat-teaser-shown')) return;

    const showTimer = window.setTimeout(() => {
      window.sessionStorage.setItem('sales-chat-teaser-shown', 'true');
      setShowTeaser(true);
    }, 4000);
    const hideTimer = window.setTimeout(() => setShowTeaser(false), 14000);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [active]);

  if (active) {
    return (
      <Suspense fallback={null}>
        <SalesChatExperience startOpen />
      </Suspense>
    );
  }

  return (
    <div className="fixed bottom-20 left-4 z-[60] sm:bottom-6 sm:left-6">
      {showTeaser && (
        <div className="absolute bottom-full right-0 mb-3 flex max-w-[min(30rem,calc(100vw-2rem))] items-start gap-4 rounded-2xl border border-slate-700 bg-slate-900 px-6 py-5 text-right text-lg leading-7 text-white shadow-2xl shadow-slate-950/50">
          <button type="button" onClick={() => setActive(true)} className="flex-1">
            هل ترغب في تنمية عيادتك؟ أنا هنا لمساعدتك.
          </button>
          <button
            type="button"
            aria-label="إخفاء الرسالة"
            onClick={() => setShowTeaser(false)}
            className="text-xl text-slate-400 transition hover:text-white"
          >
            ×
          </button>
        </div>
      )}
      <button
        type="button"
        aria-label="فتح مستشارة النمو"
        onClick={() => setActive(true)}
        className="relative flex min-h-[140px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-slate-200 bg-white/95 px-5 py-4 text-slate-800 shadow-2xl shadow-indigo-500/20 backdrop-blur transition-[transform,box-shadow] hover:scale-105 hover:shadow-indigo-500/35 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2 sm:gap-6 sm:px-8"
      >
        <span className="relative block h-28 w-28 shrink-0 rounded-full border-2 border-white/50 shadow-lg shadow-slate-950/20 sm:h-36 sm:w-36">
          <span className="absolute inset-0 overflow-hidden rounded-full">
            <Image
              src="/avatars/consultant-main.png"
              alt="مستشارة النمو"
              width={144}
              height={144}
              sizes="(max-width: 640px) 112px, 144px"
              className="h-full w-full scale-[1.4] rounded-full object-cover object-[center_30%]"
            />
          </span>
          <span className="absolute bottom-1 right-1 h-7 w-7 rounded-full border-4 border-white bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.8)] animate-pulse" />
        </span>
        <span className="flex flex-col items-start gap-1 whitespace-nowrap text-slate-800">
          <span className="text-xl font-bold sm:text-2xl">
            مستشارة النمو
            <span aria-hidden="true" className="mr-3">→</span>
          </span>
          <span className="flex items-center gap-2 text-sm font-semibold text-emerald-600 sm:text-base">
            <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
            متاحة الآن
          </span>
        </span>
      </button>
    </div>
  );
}
