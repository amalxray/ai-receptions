'use client';

import { useEffect, useState } from 'react';

/**
 * LIVE HOURS BADGE — "مفتوح الآن / مغلق" pill for the public page.
 * Reads /api/public/clinic/hours-status (slug-scoped, public-safe). Renders
 * nothing until data arrives, so SSR output stays stable (no hydration flash).
 */
type HoursStatus = {
  isOpen: boolean;
  todaySchedule: { start: string; end: string } | null;
  nextOpening: { day: string; time: string } | null;
  currentTime: string;
};

export default function HoursStatusBadge({ slug }: { slug: string }) {
  const [status, setStatus] = useState<HoursStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/clinic/hours-status?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (alive && b?.data) setStatus(b.data as HoursStatus);
      })
      .catch(() => {
        /* badge stays hidden on failure — hours table is still visible below */
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  if (!status) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
      {status.isOpen ? (
        <>
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
          <span className="font-bold text-emerald-600">مفتوح الآن</span>
          {status.todaySchedule && (
            <span className="text-slate-500" dir="ltr">
              {status.todaySchedule.start} – {status.todaySchedule.end}
            </span>
          )}
        </>
      ) : (
        <>
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" aria-hidden />
          <span className="font-bold text-rose-600">مغلق الآن</span>
          {status.nextOpening && (
            <span className="text-slate-500">
              · يفتح {status.nextOpening.day} الساعة <span dir="ltr">{status.nextOpening.time}</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}