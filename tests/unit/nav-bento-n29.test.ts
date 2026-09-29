import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DashboardNav, { getActivityNavigation } from '@/components/dashboard/DashboardNav';
import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import NavBentoGrid, { type BentoGroup } from '@/components/dashboard/NavBentoGrid';
import { NAV_GROUPS, groupNavLinks } from '@/lib/services/dashboardNavModel';
import {
  GROUP_TONES,
  formatCount,
  isModuleActive,
  missingPresentations,
  moduleFromPathname,
  navPresentation,
  navTone,
  readStoredTab,
  statForModule,
  storeTab,
} from '@/lib/services/navBentoModel';

/**
 * N29 — «إعادة تصميم التنقّل»: sticky top bar + 4 tabs + one bento per tab.
 *
 * The load-bearing promise of this task is the GOLDEN RULE: nothing was deleted
 * and nothing was disabled. So this file pins, in order:
 *
 *  1. the 32 modules still exist (activity-aware) with the owner's exact emoji,
 *  2. the grouping never loses or duplicates a module,
 *  3. the new pure helpers (active route, stats, remembered tab) behave,
 *  4. SSR of the surfaces: the sticky bar, the drawer, a tab's bento with live
 *     stats, and a locked (🔒) card.
 */

(globalThis as unknown as { React: typeof React }).React = React;

const projectRoot = path.resolve(__dirname, '../..');
const read = (relative: string) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href?: unknown; children?: unknown }) =>
    createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children as never),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/amal-xray/patients',
}));

vi.mock('@/lib/useClinicContext', () => ({
  useClinicContext: () => ({
    role: 'owner',
    clinicId: 'clinic-1',
    clinicSlug: 'amal-xray',
    clinicName: 'Amal X-Ray Center',
    activityType: 'clinic',
    loading: false,
    error: null,
    memberships: [{ clinic_id: 'clinic-1', clinic: { name: 'Amal X-Ray Center' } }],
    setActiveClinicId: async () => {},
    authHeaders: async () => ({}),
  }),
}));

/** The owner's exact 32 modules → emoji contract (the "nothing was deleted" list). */
const OWNER_EMOJI: Record<string, string> = {
  overview: '🏠',
  appointments: '📅',
  patients: '👥',
  'medical-files': '📁',
  referrals: '↪️',
  providers: '👨‍⚕️',
  services: '🦷',
  team: '👥',
  'before-after': '📸',
  badges: '🏆',
  imaging: '🩻',
  lab: '🔬',
  conversations: '💭',
  messages: '✉️',
  notifications: '🔔',
  leads: '👤',
  'imaging-centers': '🩻',
  'financial-intelligence': '💰',
  payroll: '💵',
  analytics: '📈',
  growth: '📊',
  subscription: '💳',
  'my-payslips': '🎫',
  'knowledge-base': '📚',
  'public-page': '🌐',
  'public-content': '✏️',
  profile: '👤',
  'ai-settings': '🤖',
  'communication-settings': '💬',
  ads: '📢',
  'clinic-setup': '🏥',
  setup: '⚙️',
};

describe('N29 — the 32 modules survive the redesign', () => {
  it('a clinic still has exactly 32 modules', () => {
    expect(getActivityNavigation('clinic')).toHaveLength(32);
  });

  it('every one of the 32 keeps its owner-specified emoji', () => {
    const clinic = getActivityNavigation('clinic').map((link) => link.module);
    expect([...clinic].sort()).toEqual(Object.keys(OWNER_EMOJI).sort());
    for (const [module, emoji] of Object.entries(OWNER_EMOJI)) {
      expect(navPresentation(module).emoji, module).toBe(emoji);
    }
  });

  it('every module of EVERY activity has a designed card (no silent blank)', () => {
    for (const activity of ['clinic', 'imaging_center', 'dental_lab', null, undefined]) {
      const modules = getActivityNavigation(activity).map((link) => link.module);
      expect(missingPresentations(modules), String(activity)).toEqual([]);
    }
  });

  it('every module of every activity lands in one of the four tabs', () => {
    const ids = NAV_GROUPS.map((group) => group.id);
    for (const activity of ['clinic', 'imaging_center', 'dental_lab']) {
      const grouped = groupNavLinks(getActivityNavigation(activity));
      expect(grouped).toHaveLength(4);
      expect(grouped.map((group) => group.label)).toEqual([
        'التشغيل اليومي',
        'التواصل',
        'المالية والنمو',
        'الإعدادات والحساب',
      ]);
      for (const group of grouped) {
        expect(ids).toContain(group.id);
        for (const item of group.items) {
          expect(navPresentation(item.module).description.length, item.module).toBeGreaterThan(0);
        }
      }
    }
  });

  it('grouping preserves the exact module multiset (no loss, no duplicate)', () => {
    const modules = getActivityNavigation('clinic').map((link) => link.module);
    const grouped = groupNavLinks(getActivityNavigation('clinic')).flatMap((group) =>
      group.items.map((item) => item.module)
    );
    expect(grouped.sort()).toEqual([...modules].sort());
  });

  it('the four tabs have four distinct colour tones', () => {
    const tones = NAV_GROUPS.map((group) => navTone(group.id));
    expect(new Set(tones.map((tone) => tone.tab)).size).toBe(4);
    expect(Object.keys(GROUP_TONES)).toHaveLength(4);
  });
});

describe('N29 — active route (the old sidebar had no highlight at all)', () => {
  it('reads the module out of /dashboard/{slug}/{module}[/…]', () => {
    expect(moduleFromPathname('/dashboard/amal-xray/patients')).toBe('patients');
    expect(moduleFromPathname('/dashboard/amal-xray/patients/4d3a2679-1')).toBe('patients');
    expect(moduleFromPathname('/dashboard/amal-xray/overview')).toBe('overview');
  });

  it('returns null where no card should light up', () => {
    expect(moduleFromPathname('/dashboard')).toBeNull();
    expect(moduleFromPathname('/dashboard/tenants')).toBeNull();
    expect(moduleFromPathname('/dashboard/upgrade/analytics')).toBeNull();
    expect(moduleFromPathname(null)).toBeNull();
    expect(moduleFromPathname(undefined)).toBeNull();
  });

  it('isModuleActive is exactly "this route"', () => {
    const pathname = '/dashboard/amal-xray/patients';
    expect(isModuleActive(pathname, 'patients')).toBe(true);
    expect(isModuleActive(pathname, 'appointments')).toBe(false);
  });
});

describe('N29 — live statistic chips', () => {
  const stats = {
    patientsCount: 43,
    todayAppointments: 6,
    conversations: 3,
    needsAttention: 0,
    outstanding: 1200,
    planName: 'أساسية',
  };

  it('maps each statistic to the module that owns it', () => {
    expect(statForModule('patients', stats)?.text).toBe('43 مريض');
    expect(statForModule('appointments', stats)?.text).toBe('6 اليوم');
    expect(statForModule('conversations', stats)?.text).toBe('3 جديدة');
    expect(statForModule('notifications', stats)?.text).toBe('لا تنبيهات');
    expect(statForModule('financial-intelligence', stats)?.text).toBe('1,200 مستحق');
    expect(statForModule('subscription', stats)).toEqual({ text: 'أساسية', tone: 'plan' });
  });

  it('never invents a number when the source is unavailable', () => {
    expect(statForModule('patients', {})).toBeNull();
    expect(statForModule('patients', { patientsCount: null })).toBeNull();
    expect(statForModule('appointments', { todayAppointments: undefined })).toBeNull();
    expect(statForModule('subscription', { planName: null })).toBeNull();
    expect(statForModule('services', stats)).toBeNull();
    expect(formatCount(1200)).toBe('1,200');
  });
});

describe('N29 — remembered tab is SSR-safe', () => {
  it('returns null on the server (no window) and never throws when storing', () => {
    expect(typeof window).toBe('undefined');
    expect(readStoredTab()).toBeNull();
    expect(() => storeTab('finance')).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* SSR — the four scenarios                                                   */
/* -------------------------------------------------------------------------- */

const TAB_LABELS = ['التشغيل اليومي', 'التواصل', 'المالية والنمو', 'الإعدادات والحساب'];

describe('N29 — SSR scenarios', () => {
  it('(أ) sticky bar: identity + tenant switcher + the four tabs, panel closed', () => {
    const html = renderToStaticMarkup(createElement(DashboardTopNav));
    expect(html).toContain('Amal X-Ray Center');
    expect(html).toContain('موظفة استقبال الأسنان الذكية');
    expect(html).toContain('sticky top-0');
    expect(html).toContain('role="tablist"');
    for (const label of TAB_LABELS) expect(html).toContain(label);
    // The active tab follows the ROUTE (mocked /dashboard/amal-xray/patients → ops).
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-selected="false"');
    // Tenant switcher survived the sidebar removal.
    expect(html).toContain('المؤسسة:');
    // Closed panel ⇒ no bento cards yet.
    expect(html).not.toContain('الوحدة الحالية');
  });

  it('(ب) drawer surface: all four groups and every module label', () => {
    const html = renderToStaticMarkup(createElement(DashboardNav, { surface: 'drawer' }));
    for (const label of TAB_LABELS) expect(html).toContain(label);
    for (const link of getActivityNavigation('clinic')) {
      expect(html, link.module).toContain(link.label);
    }
    // Every card carries its emoji + its one-line description.
    expect(html).toContain('🏠');
    expect(html).toContain('ابحث وافتح ملف المريض');
  });

  it('(ج) a tab bento: live chips + the active card', () => {
    const ops = groupNavLinks(getActivityNavigation('clinic')).find((group) => group.id === 'ops');
    const group: BentoGroup = {
      id: 'ops',
      label: ops?.label ?? '',
      icon: ops?.icon ?? '',
      items: (ops?.items ?? []).map((item) => ({
        module: item.module,
        label: item.label,
        href: `/dashboard/amal-xray/${item.module}`,
        active: item.module === 'patients',
        locked: false,
      })),
    };
    const html = renderToStaticMarkup(
      createElement(NavBentoGrid, {
        group,
        variant: 'panel',
        stats: { patientsCount: 43, todayAppointments: 6 },
      })
    );
    expect(html).toContain('المرضى');
    expect(html).toContain('43 مريض');
    expect(html).toContain('6 اليوم');
    expect(html).toContain('الوحدة الحالية');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('/dashboard/amal-xray/patients');
  });

  it('(د) a locked module still renders — as a 🔒 upsell card, not a hole', () => {
    const group: BentoGroup = {
      id: 'finance',
      label: 'المالية والنمو',
      icon: '📊',
      items: [
        {
          module: 'analytics',
          label: 'التحليلات',
          href: '/dashboard/upgrade/analytics',
          active: false,
          locked: true,
          lockTitle: 'متاح في باقة متقدمة',
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(NavBentoGrid, { group, variant: 'panel', stats: {} }));
    expect(html).toContain('التحليلات');
    expect(html).toContain('🔒');
    expect(html).toContain('/dashboard/upgrade/analytics');
    expect(html).toContain('متاح في باقة متقدمة');
  });
});

describe('N29 — wiring guards', () => {
  const dock = read('components/ui/dock.tsx');
  const nav = read('components/dashboard/DashboardNav.tsx');
  const topnav = read('components/dashboard/DashboardTopNav.tsx');
  const layout = read('app/(dashboard)/layout.tsx');

  it('the Dock gained an inline variant and the /ask floating dock is untouched', () => {
    expect(dock).toContain("variant = 'fixed'");
    expect(dock).toContain("'inline'");
    expect(dock).toContain("role={variant === 'inline' ? 'tablist' : undefined}");
    expect(dock).toContain('fixed bottom-4 left-1/2 z-50');
  });

  it('the tabs really are the inline Dock, and the choice is remembered', () => {
    expect(nav).toContain('<Dock variant="inline"');
    expect(nav).toContain('layoutId="dash-topnav-tab"');
    expect(nav).toContain('storeTab(');
    expect(nav).toContain('readStoredTab()');
  });

  it('every gate survived the rewrite (roles, permissions, plan locks, activity nav)', () => {
    expect(nav).toContain('ADMIN_ONLY_MODULES');
    expect(nav).toContain('MODULE_PERMISSIONS');
    expect(nav).toContain('MODULE_FEATURES');
    expect(nav).toContain('getRequiredPlanNameAr');
    expect(nav).toContain('/api/clinic/permissions/me');
    expect(nav).toContain('export function getActivityNavigation');
    expect(nav).toContain("surface === 'drawer'");
    // The accordion implementation is gone; nothing else about the list changed.
    expect(nav).not.toContain('<details');
  });

  it('the layout no longer mounts a sidebar column and mounts the top bar instead', () => {
    expect(layout).toContain('<DashboardTopNav />');
    expect(layout).not.toContain("from '@/components/dashboard/DashboardSidebar'");
    expect(layout).not.toContain("from '@/components/dashboard/DashboardMobileNav'");
    expect(layout).not.toContain('<DashboardSidebar />');
    expect(layout).not.toContain('<DashboardMobileNav />');
    expect(layout).not.toContain('lg:grid-cols-[280px_minmax(0,1fr)]');
  });

  it('the top bar keeps the tenant switcher and sticks to the top', () => {
    expect(topnav).toContain('ClinicSwitcher');
    expect(topnav).toContain('sticky top-0');
  });

  it('the four tabs scroll horizontally on a narrow phone', () => {
    expect(nav).toContain('overflow-x-auto');
  });
});

