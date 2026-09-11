'use client';

import { useClinicContext } from '@/lib/useClinicContext';
import { ACTIVITY_TYPE_LABELS_AR } from '@/lib/services/activityTypes';
import { getActivityLabels } from '@/lib/clinic/activityLabels';

/**
 * DASHBOARD ACTIVITY IDENTITY (root-cause fix)
 * --------------------------------------------
 * Renders the dashboard title/subtitle from the tenant's `activity_type`
 * (server-resolved via useClinicContext). Imaging centers / labs / clinics
 * each get correct terminology instead of a fixed Dental-Clinic identity.
 * Single source of copy: getActivityLabels (lib/clinic/activityLabels.ts).
 */
export default function ActivityIdentity() {
  const { activityType, clinicName } = useClinicContext();
  const labels = getActivityLabels(activityType);

  const type = activityType && activityType in ACTIVITY_TYPE_LABELS_AR
    ? (activityType as keyof typeof ACTIVITY_TYPE_LABELS_AR)
    : null;
  const label = type ? ACTIVITY_TYPE_LABELS_AR[type] : 'المؤسسة';

  return (
    <div>
      <p className="text-sm tracking-[0.1em] text-cyan-300/80">{label}</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">{labels.dashboardTitle}</h1>
      <p className="mt-1 text-sm text-slate-400">
        {clinicName ? `${label}: ${clinicName}` : labels.dashboardSubtitle}
      </p>
    </div>
  );
}