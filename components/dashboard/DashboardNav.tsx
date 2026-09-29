'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useClinicContext } from '@/lib/useClinicContext';
import { groupNavLinks, type NavGroupId, type NavModule } from '@/lib/services/dashboardNavModel';
import { tenantDashboardUrl } from '@/lib/services/dashboardPaths';
import {
  moduleFromPathname,
  navTone,
  readStoredTab,
  storeTab,
  type NavStats,
} from '@/lib/services/navBentoModel';
import NavBentoGrid, { type BentoGroup } from '@/components/dashboard/NavBentoGrid';
import { Dock, DockIcon } from '@/components/ui/dock';
import {
  getLockedFeatures,
  getPlanDisplayNameAr,
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
  { module: 'referrals', label: 'التحويلات' },
  { module: 'providers', label: 'الأطباء' },
  { module: 'services', label: 'الخدمات' },
  { module: 'team', label: 'إدارة الفريق' },
  { module: 'conversations', label: 'محادثات الذكاء الاصطناعي' },
  { module: 'messages', label: 'الرسائل' },
  { module: 'notifications', label: 'الإشعارات' },
  { module: 'leads', label: 'العملاء المحتملون' },
  { module: 'financial-intelligence', label: 'الذكاء المالي' },
  { module: 'payroll', label: 'الرواتب', icon: '💰' },
  { module: 'my-payslips', label: 'قسائمي', icon: '📄' },
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
    // it does not refer patients to imaging centers, and imaging referrals
    // (B20, a clinic ↔ imaging center flow) do not apply to it.
    modules = modules.filter(
      (m) =>
        m.module !== 'appointments' &&
        m.module !== 'leads' &&
        m.module !== 'imaging-centers' &&
        m.module !== 'referrals'
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

// #43 — module → permission key. Modules WITHOUT a mapping stay visible for
// every member (Global by Default); mapped modules render only when the
// member's EFFECTIVE permissions include the key. The sidebar is convenience
// only — real enforcement lives in the APIs (permission gate) and RLS.
const MODULE_PERMISSIONS: Partial<Record<string, string>> = {
  overview: 'view_overview',
  appointments: 'view_appointments',
  patients: 'view_patients',
  'medical-files': 'view_medical_files',
  conversations: 'view_conversations',
  messages: 'view_messages',
  'imaging-requests': 'view_imaging_requests',
  // B20 — referrals reuse the imaging-requests permission (no new permission
  // row / migration); the sidebar stays convenience, APIs keep enforcing.
  referrals: 'view_imaging_requests',
  leads: 'view_leads',
  'financial-intelligence': 'view_financial',
  analytics: 'view_analytics',
  growth: 'view_growth',
  team: 'manage_team',
  ads: 'manage_ads',
  'knowledge-base': 'manage_knowledge',
  'public-page': 'view_public_page',
  'public-content': 'manage_public_page',
  subscription: 'manage_subscription',
  // Payroll Phase 2 (20261016)
  payroll: 'view_payroll',
  'my-payslips': 'view_own_payslips',
};

/**
 * N29 — the sidebar accordion is gone; the nav is now a sticky top bar with four
 * tabs (one per NAV_GROUPS group) and a bento grid per tab. The "remember my
 * choice" behaviour moved from open/collapsed GROUPS to the selected TAB
 * (`NAV_TAB_STORAGE_KEY` in lib/services/navBentoModel).
 */

export default function DashboardNav({ surface = 'drawer' }: { surface?: 'bar' | 'drawer' }) {
  const pathname = usePathname();
  const { role, clinicId, clinicSlug, activityType, authHeaders } = useClinicContext();
  const isAdmin = role === 'owner' || role === 'manager';
  const groups = groupNavLinks(getActivityNavigation(activityType));
  const firstGroupId = groups.length > 0 ? groups[0].id : undefined;
  /** The module the user is looking at right now — drives tab + card highlight. */
  const activeModule = moduleFromPathname(pathname);

  /** Canonical tenant URL for a module (flat path before the slug resolves). */
  const hrefFor = useCallback(
    (module: string): string =>
      clinicSlug ? tenantDashboardUrl(clinicSlug, module) : `/dashboard/${module}`,
    [clinicSlug]
  );

  // Subscription-driven locks. `planId === undefined` means "still resolving" —
  // the sidebar fails OPEN while loading (no lock flash); the API routes keep
  // enforcing 402 regardless of what the UI shows.
  const [planId, setPlanId] = useState<string | null | undefined>(undefined);

  // #43 — the caller's effective permission keys. `undefined` = still loading
  // (fail OPEN, exactly like plan locks); owners skip the fetch entirely.
  const [perms, setPerms] = useState<Set<string> | null | undefined>(undefined);

  useEffect(() => {
    if (!clinicId || isAdmin) {
      setPerms(null); // null = no permission filtering
      return;
    }
    let alive = true;
    setPerms(undefined);
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/clinic/permissions/me?clinic_id=${encodeURIComponent(clinicId)}`, { headers });
        if (!res.ok) { if (alive) setPerms(null); return; } // fail open
        const json = await res.json().catch(() => null);
        if (alive) setPerms(new Set<string>(json?.data ?? []));
      } catch {
        if (alive) setPerms(null); // fail open — server still gates
      }
    })();
    return () => {
      alive = false;
    };
  }, [clinicId, isAdmin, authHeaders]);

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

  /* ------------------------------------------------------------------------ */
  /* N29 — tab state (persisted), bento groups, live stats, panel             */
  /* ------------------------------------------------------------------------ */

  /** Remembered tab, else the group of the CURRENT route, else the first group. */
  const [tab, setTab] = useState<NavGroupId | null>(null);
  const [stored, setStored] = useState<NavGroupId | null>(null);
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<NavStats>({});

  useEffect(() => {
    setStored(readStoredTab());
  }, []);

  const activeGroupId = useMemo<NavGroupId | undefined>(
    () =>
      activeModule
        ? groups.find((group) => group.items.some((item) => item.module === activeModule))?.id
        : undefined,
    [groups, activeModule]
  );

  const selectedTab: NavGroupId | undefined = tab ?? activeGroupId ?? stored ?? firstGroupId;

  /** One coloured bento per tab — gated exactly like the old accordion was. */
  const bentoGroups: BentoGroup[] = useMemo(
    () =>
      groups.map((group) => {
        const items = group.items
          .filter((item) => isAdmin || !ADMIN_ONLY_MODULES.has(item.module))
          .filter((item) => {
            if (perms === null || perms === undefined) return true; // loading/owner → fail open
            const required = MODULE_PERMISSIONS[item.module];
            return required === undefined || perms.has(required);
          })
          .map((item) => {
            const feature = MODULE_FEATURES[item.module];
            const locked = feature !== undefined && lockedFeatures.has(feature);
            return {
              module: item.module,
              label: item.label,
              href: locked ? `/dashboard/upgrade/${feature}` : hrefFor(item.module),
              active: item.module === activeModule,
              locked,
              lockTitle: locked && feature ? `متاح في باقة ${getRequiredPlanNameAr(feature)}` : undefined,
            };
          });
        return { id: group.id, label: group.label, icon: group.icon, items };
      }),
    [groups, isAdmin, perms, lockedFeatures, hrefFor, activeModule]
  );

  /** Live chips: today's counts, conversations needing a human, outstanding money. */
  useEffect(() => {
    if (!clinicId) return;
    let alive = true;
    (async () => {
      try {
        const headers = await authHeaders();
        const getJson = (url: string) =>
          fetch(url, { headers }).then((res) => (res.ok ? res.json() : Promise.reject(new Error(url))));
        const [overview, invoices] = await Promise.allSettled([
          getJson(`/api/clinic/overview?clinic_id=${encodeURIComponent(clinicId)}`),
          getJson(`/api/clinic/accounting/invoices?clinic_id=${encodeURIComponent(clinicId)}`),
        ]);
        if (!alive) return;
        const next: NavStats = {};
        if (overview.status === 'fulfilled') {
          next.patientsCount = overview.value?.data?.patients_count ?? null;
          next.todayAppointments = Array.isArray(overview.value?.data?.today_appointments)
            ? overview.value.data.today_appointments.length
            : null;
          next.conversations = overview.value?.data?.new_conversations_count ?? null;
          next.needsAttention = overview.value?.data?.needs_attention_count ?? null;
        }
        if (invoices.status === 'fulfilled') {
          const rows = Array.isArray(invoices.value?.data) ? invoices.value.data : [];
          next.outstanding = rows.reduce(
            (sum: number, row: { balance_amount?: number }) =>
              sum + Math.max(Number(row?.balance_amount ?? 0) || 0, 0),
            0
          );
        }
        // The plan name was already fetched above for the lock state.
        if (typeof planId === 'string') next.planName = getPlanDisplayNameAr(planId);
        setStats(next);
      } catch {
        /* never block navigation on a stats failure */
      }
    })();
    return () => {
      alive = false;
    };
  }, [clinicId, authHeaders, planId]);

  // Navigate → close; Escape → close (the backdrop closes it too).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const selectTab = (id: NavGroupId) => {
    setTab(id);
    storeTab(id);
    // Re-selecting the active tab toggles the panel, like any mega-menu.
    setOpen((current) => !(current && selectedTab === id));
  };

  /* ------------------------------------------------------------------------ */
  /* Drawer surface — the mobile drawer keeps every module reachable           */
  /* ------------------------------------------------------------------------ */

  if (surface === 'drawer') {
    return (
      <div className="space-y-5">
        {bentoGroups.map((group) => (
          <NavBentoGrid key={group.id} group={group} stats={stats} variant="drawer" />
        ))}
      </div>
    );
  }

  const activeGroup = bentoGroups.find((group) => group.id === selectedTab) ?? bentoGroups[0];
  const tone = navTone(activeGroup?.id ?? 'ops');

  return (
    <div className="relative">
      {/* Four tabs — the Dock embedded INLINE (N29). */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <Dock variant="inline" className="shrink-0">
          {bentoGroups.map((group) => {
            const selected = group.id === selectedTab;
            return (
              <DockIcon
                key={group.id}
                active={selected}
                onClick={() => selectTab(group.id)}
                ariaLabel={group.label}
                lift={3}
                hoverScale={1.04}
                className="h-11 gap-2 px-3.5 text-sm font-semibold"
              >
                {selected ? (
                  <motion.span
                    layoutId="dash-topnav-tab"
                    className={`absolute inset-0 rounded-xl bg-gradient-to-l ring-1 ${navTone(group.id).tab}`}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                ) : null}
                <span className="relative z-10 flex items-center gap-2 whitespace-nowrap">
                  <motion.span aria-hidden animate={{ scale: selected ? 1.15 : 1 }}>
                    {group.icon}
                  </motion.span>
                  <span className={selected ? 'text-white' : 'text-slate-300'}>{group.label}</span>
                  <span className="rounded-full bg-slate-950/60 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                    {group.items.length}
                  </span>
                </span>
              </DockIcon>
            );
          })}
        </Dock>

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label="إظهار وحدات القسم"
          className="ms-auto shrink-0 rounded-full border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-500/50 hover:text-white"
        >
          {open ? '✕ إغلاق القسم' : '▾ عرض الوحدات'}
        </button>
      </div>

      {/* The bento of the selected tab. */}
      <AnimatePresence initial={false}>
        {open && activeGroup ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              className={`mt-3 rounded-[1.75rem] border bg-slate-950/95 p-5 shadow-2xl shadow-slate-950/60 ring-1 backdrop-blur-xl ${tone.ring}`}
            >
              <NavBentoGrid group={activeGroup} stats={stats} variant="panel" onNavigate={() => setOpen(false)} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}