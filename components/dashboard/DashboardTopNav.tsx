'use client';

import { motion } from 'framer-motion';
import { useClinicContext } from '@/lib/useClinicContext';
import { getActivityLabels } from '@/lib/clinic/activityLabels';
import ClinicSwitcher from '@/components/dashboard/ClinicSwitcher';
import DashboardNav from '@/components/dashboard/DashboardNav';

/**
 * N29 — the STICKY TOP BAR that replaces the 280px sidebar column.
 *
 * It carries the three things the sidebar used to own: (1) the tenant identity
 * (activity-aware Arabic title + clinic name), (2) the multi-clinic switcher, and
 * (3) the navigation itself — now four tabs (🏥 💬 📊 ⚙️) with a bento grid per
 * tab, rendered by `<DashboardNav surface="bar" />` which keeps every gate
 * (roles, permissions, plan locks, activity-aware module list) untouched.
 *
 * Full-bleed negative margins make the bar span the shell padding, and the
 * horizontal scroll keeps the four tabs reachable on a 320px phone.
 */

export default function DashboardTopNav() {
  const { clinicName, activityType, loading } = useClinicContext();
  const labels = getActivityLabels(activityType);

  return (
    <motion.header
      initial={{ opacity: 0, y: -14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-40 -mx-4 mb-6 border-b border-slate-800 bg-slate-950/85 px-4 py-3 shadow-lg shadow-slate-950/30 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      aria-label="تنقّل لوحة التحكم"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">
            <span aria-hidden>🏥</span> لوحة التحكم
          </p>
          <h1 className="truncate text-lg font-semibold text-white">{labels.dashboardTitle}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 truncate text-xs text-slate-400">
            {loading ? (
              <span className="inline-block h-3 w-44 animate-pulse rounded-full bg-slate-800" />
            ) : (
              <>
                <span className="font-medium text-slate-300">{clinicName ?? 'غير محددة'}</span>
                <span className="text-slate-600">·</span>
                <span>{labels.dashboardSubtitle}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ClinicSwitcher />
        </div>
      </div>

      <div className="mt-3">
        <DashboardNav surface="bar" />
      </div>
    </motion.header>
  );
}