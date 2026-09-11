'use client';

import { useClinicContext } from '@/lib/useClinicContext';
import { getActivityLabels } from '@/lib/clinic/activityLabels';
import ClinicSwitcher from '@/components/dashboard/ClinicSwitcher';
import DashboardNav from '@/components/dashboard/DashboardNav';

/**
 * TENANT-ISOLATED DASHBOARD — sidebar identity + navigation.
 * Titles/subtitles come from the tenant's activity_type (single source:
 * getActivityLabels) so centers/labs never see dental-clinic wording.
 */
export default function DashboardSidebar() {
  const { clinicName, activityType, loading } = useClinicContext();
  const labels = getActivityLabels(activityType);

  return (
    <div>
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-300/80">لوحة التحكم</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">{labels.dashboardTitle}</h1>
        <p className="mt-1 text-sm leading-6 text-slate-400">{labels.dashboardSubtitle}.</p>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
        <p className="text-xs text-slate-500">المؤسسة</p>
        <p className="mt-1 text-sm font-semibold text-slate-200">
          {loading ? 'جارٍ التحميل…' : clinicName ?? 'غير محددة'}
        </p>
      </div>

      <div className="mt-4">
        <ClinicSwitcher />
      </div>

      <div className="mt-6 border-t border-slate-800 pt-6">
        <DashboardNav />
      </div>
    </div>
  );
}