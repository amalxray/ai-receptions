'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import DashboardSidebar from '@/components/dashboard/DashboardSidebar';

/**
 * #40 — MOBILE DASHBOARD NAVIGATION.
 * The dashboard sidebar (27 modules) used to stack ABOVE the content on
 * phones, forcing a long scroll before any content. Desktop keeps the static
 * sidebar (lg:block in the layout); on mobile a sticky hamburger opens a
 * right-to-left drawer (RTL) with the full DashboardSidebar inside.
 */
export default function DashboardMobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever navigation happens (any link inside it).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open + close on Escape.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      {/* Sticky mobile bar — never rendered on desktop (lg:hidden). */}
      <div className="sticky top-0 z-40 -mx-4 mb-2 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="فتح قائمة لوحة التحكم"
          aria-expanded={open}
          className="inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-lg text-slate-200 transition hover:bg-slate-800"
        >
          ☰
        </button>
        <span className="text-sm font-semibold text-slate-300">لوحة التحكم</span>
        <span className="w-[44px]" aria-hidden="true" />
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="قائمة لوحة التحكم">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/70 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 right-0 w-[86%] max-w-xs overflow-y-auto border-l border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-300">القائمة</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-slate-300 transition hover:bg-slate-800"
              >
                ✕
              </button>
            </div>
            <DashboardSidebar />
          </div>
        </div>
      )}
    </>
  );
}