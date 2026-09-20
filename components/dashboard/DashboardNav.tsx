'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useClinicContext } from '@/lib/useClinicContext';
import { groupNavLinks, type NavModule } from '@/lib/services/dashboardNavModel';
import { tenantDashboardUrl } from '@/lib/services/dashboardPaths';
import {
  getLockedFeatures,
  getRequiredPlanNameAr,
  type FeatureKey,
} from '@/lib/subscription/featureGate';

/**
 * TENANT-ISOLATED DASHBOARD — Arabic, grouped, role-gated sidebar navigation.
 *
 * `getActivityNavigation` is the single source of WHICH modules exist for an
 * activity type (clinic / imaging_center / dental_lab). `DashboardNav` renders
 * them grouped via `groupNavLinks` (NAV_GROUPS) and points every link at the
 * canonical tenant URL `/dashboard/{clinicSlug}/{module}` once the clinic
 * context resolves — before that it falls back to the flat path, which the
 * server compat-redirects to the canonical tenant route.
 */

/** Base navigation for a dental clinic — Arabic labels, canonical order. */
const BASE_NAV: NavModule[] = [
  { module: 'overview', label: 'الرئيسية' },
  { module: 'appointments', label: 'المواعيد' },
  { module: 'patients', label: 'المرضى' },
  { module: 'medical-files', label: 'الملفات الطبية' },
  { module: 'providers', label: 'الأطباء' },
  { module: 'services', label: 'الخدمات' },
  { module: 'team', label: 'إدارة الفريق' },
  { module: 'conversations', label: 'محادثات الذكاء الاصطناعي' },
  { module: 'messages', label: 'الرسائل' },
  { module: 'notifications', label: 'الإشعارات' },
  { module: 'leads', label: 'العملاء المحتملون' },
  { module: 'financial-intelligence', label: 'الذكاء المالي' },
  { module: 'analytics', label: 'التحليلات' },
  { module: 'growth', label: 'النمو' },
  { module: 'subscription', label: 'الاشتراك' },
  { module: 'knowledge-base', label: 'قاعدة المعرفة' },
  { module: 'public-page', label: 'الصفحة العامة' },
  { module: 'public-content', label: 'محتوى الصفحة العامة' },
  { module: 'before-after', label: 'قبل / بعد' },
  { module: 'badges', label: 'شارات الإنجازات' },
  { module: 'profile', label: 'الملف الشخصي' },
  { module: 'ai-settings', label: 'إعدادات الذكاء الاصطناعي' },
  { module: 'communication-settings', label: 'إعدادات التواصل' },
  { module: 'ads', label: 'الإعلانات' },
  { module: 'imaging', label: 'الأشعة والتصوير' },
  { module: 'lab', label: 'المختبر' },
  { module: 'imaging-centers', label: 'مراكز الأشعة' },
  { module: 'clinic-setup', label: 'إعداد العيادة' },
  { module: 'setup', label: 'إعداد الحساب' },
];

/** Imaging-center workflow modules — inserted right after `overview`. */
const IMAGING_WORKFLOW: NavModule[] = [
  { module: 'imaging-requests', label: 'طلبات الأشعة' },
  { module: 'referring-clinics', label: 'العيادات المحوِّلة' },
];

/**
 * ACTIVITY-AWARE navigation. A dental clinic, an imaging center and a dental
 * lab are different businesses — they must not share one flat nav list.
 * `null` falls back to clinic navigation (backward compatible).
 */
export function getActivityNavigation(activity?: string | null): NavModule[] {
  const type = activity ?? 'clinic';
  let modules = [...BASE_NAV];

  if (type === 'imaging_center') {
    // An imaging center has no leads/growth funnel — it serves referring clinics.
    // "مراكز الأشعة" makes no sense inside an imaging center's own nav — it
    // RECEIVES referrals, it does not send patients to other imaging centers.
    modules = modules.filter(
      (m) => m.module !== 'leads' && m.module !== 'growth' && m.module !== 'imaging-centers'
    );
    const overviewIdx = modules.findIndex((m) => m.module === 'overview');
    modules.splice(overviewIdx + 1, 0, ...IMAGING_WORKFLOW);
  } else if (type === 'dental_lab') {
    // A lab receives cases from clinics — no appointments, no lead capture,
    // and it does not refer patients to imaging centers. It only sees the
    // referring clinics that send work to it.
    modules = modules.filter(
      (m) => m.module !== 'appointments' && m.module !== 'leads' && m.module !== 'imaging-centers'
    );
    const overviewIdx = modules.findIndex((m) => m.module === 'overview');
    modules.splice(overviewIdx + 1, 0, { module: 'referring-clinics', label: 'العيادات المحوِّلة' });
  }

  return modules;
}

// Role-gated modules. UI gating is convenience only — real enforcement happens
// in the API (roleDenied) and RLS.
const ADMIN_ONLY_MODULES = new Set(['providers', 'services', 'ai-settings', 'subscription', 'team', 'setup']);

/**
 * PHASE 2 — module → subscription feature. A module whose feature is not
 * unlocked by the clinic's plan renders as a 🔒 upsell link (and the API for
 * that module returns 402 anyway — the sidebar lock is convenience only).
 * Modules absent from this map are never locked.
 */
const MODULE_FEATURES: Partial<Record<string, FeatureKey>> = {
  'financial-intelligence': 'analytics',
  analytics: 'analytics',
  growth: 'analytics',
  'before-after': 'before-after',
  badges: 'badges',
  team: 'team',
};

/** localStorage key remembering open/collapsed sidebar groups. */
const OPEN_STATE_KEY = 'dashnav_open_groups_v1';

function readOpenState(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(OPEN_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export default function DashboardNav() {
  const { role, clinicSlug, activityType, authHeaders } = useClinicContext();
  const isAdmin = role === 'owner' || role === 'manager';
  const groups = groupNavLinks(getActivityNavigation(activityType));
  const firstGroupId = groups.length > 0 ? groups[0].id : undefined;

  // Subscription-driven locks. `planId === undefined` means "still resolving" —
  // the sidebar fails OPEN while loading (no lock flash); the API routes keep
  // enforcing 402 regardless of what the UI shows.
  const [planId, setPlanId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch('/api/clinic/subscription', { headers });
        if (!res.ok) return; // fail open — 402 enforcement lives server-side
        const json = await res.json().catch(() => null);
        const pid = json?.data?.entitlements?.planId;
        if (alive && typeof pid === 'string') setPlanId(pid);
      } catch {
        /* network unavailable — stay unlocked in the UI, server still gates */
      }
    })();
    return () => {
      alive = false;
    };
  }, [authHeaders]);

  const lockedFeatures = useMemo(
    () => (planId === undefined ? new Set<FeatureKey>() : new Set(getLockedFeatures(planId))),
    [planId]
  );

  // Open/closed state: persisted in localStorage; the FIRST group (التشغيل
  // اليومي) is open by default unless the user collapsed it before.
  const persisted = useMemo(readOpenState, []);
  const [openState, setOpenState] = useState<Record<string, boolean>>({});

  const isOpen = (id: string): boolean =>
    openState[id] ?? persisted[id] ?? id === firstGroupId;

  const toggle = (id: string) => {
    const next = { ...openState, [id]: !isOpen(id) };
    setOpenState(next);
    try {
      window.localStorage.setItem(OPEN_STATE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — keep session-only */
    }
  };

  const hrefFor = (module: string): string =>
    clinicSlug ? tenantDashboardUrl(clinicSlug, module) : `/dashboard/${module}`;

  return (
    <nav aria-label="قائمة لوحة التحكم" className="space-y-2">
      {groups.map((group) => {
        const items = group.items.filter((item) => isAdmin || !ADMIN_ONLY_MODULES.has(item.module));
        if (items.length === 0) return null;
        return (
          <details key={group.id} open={isOpen(group.id)} className="group rounded-xl border border-slate-800/70 bg-slate-950/40">
            <summary
              onClick={(e) => {
                e.preventDefault();
                toggle(group.id);
              }}
              className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200"
            >
              <span>
                {group.icon} {group.label}
              </span>
              <span className="text-slate-600 transition group-open:rotate-90" aria-hidden="true">
                ▸
              </span>
            </summary>
            <div className="space-y-1 px-2 pb-2 pt-1">
              {items.map((item) => {
                const feature = MODULE_FEATURES[item.module];
                const locked = feature !== undefined && lockedFeatures.has(feature);
                if (locked) {
                  return (
                    <Link
                      key={item.module}
                      href={`/dashboard/upgrade/${feature}`}
                      title={`متاح في باقة ${getRequiredPlanNameAr(feature)}`}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-800/70 hover:text-slate-300"
                    >
                      <span>{item.label}</span>
                      <span aria-hidden="true">🔒</span>
                    </Link>
                  );
                }
                return (
                  <Link
                    key={item.module}
                    href={hrefFor(item.module)}
                    className="block rounded-xl px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800/70 hover:text-white"
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </details>
        );
      })}
    </nav>
  );
}