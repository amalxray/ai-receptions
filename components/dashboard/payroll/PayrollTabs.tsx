'use client';

import Link from 'next/link';
import { tenantDashboardUrl } from '@/lib/services/dashboardPaths';

/**
 * Payroll section tabs — the navigation between the three payroll screens
 * (periods → per-provider salaries → advances).
 *
 * Each tab is a REAL path, so the section state lives in the URL: a reload, a
 * bookmark, a shared link and the browser Back button all land on the same
 * screen. The active tab is derived from the route, never from client state.
 *
 * Deliberately not a sidebar entry: the sidebar keeps a single «الرواتب» item
 * and the tabs live inside the payroll pages only.
 */
export type PayrollTab = 'periods' | 'compensations' | 'advances';

const TABS: { key: PayrollTab; label: string; module: string }[] = [
  { key: 'periods', label: 'الفترات', module: 'payroll' },
  { key: 'compensations', label: 'رواتب المنتسبين', module: 'payroll/compensations' },
  { key: 'advances', label: 'السلف', module: 'payroll/advances' },
];

export default function PayrollTabs({
  clinicSlug,
  active,
}: {
  clinicSlug: string | null;
  active: PayrollTab;
}) {
  // No slug yet (clinic still resolving) → render the same tabs without links so
  // the page never points at `/dashboard/null/payroll`.
  const ready = typeof clinicSlug === 'string' && clinicSlug.length > 0;

  return (
    <div
      role="tablist"
      aria-label="أقسام الرواتب"
      className="flex flex-wrap gap-1 rounded-2xl border border-slate-800 bg-slate-900/70 p-1.5"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const className = isActive
          ? 'rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950'
          : 'rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-slate-800/70';
        if (!ready) {
          return (
            <span key={tab.key} className={className}>
              {tab.label}
            </span>
          );
        }
        return (
          <Link
            key={tab.key}
            href={tenantDashboardUrl(clinicSlug, tab.module)}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            className={className}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
