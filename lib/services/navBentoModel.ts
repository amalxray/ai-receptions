/**
 * N29 — navigation BENTO model: pure presentation data + pure helpers.
 *
 * The dashboard's 32 modules already have a single source of WHICH modules exist
 * (`getActivityNavigation`) and of their GROUP (`dashboardNavModel`). What was
 * missing — and what this file adds — is everything the new top-bar bento needs:
 *
 *  1. per-module emoji + Arabic one-liner + colour tone + bento span,
 *  2. which live statistic a module card may show (`statForModule`),
 *  3. ACTIVE-ROUTE detection (`moduleFromPathname` / `isModuleActive`) — the old
 *     sidebar never highlighted the current page at all,
 *  4. the persisted tab (the old accordion remembered open groups; the tabs
 *     remember the chosen tab the same way).
 *
 * No React, no fetch, no imports from components — unit tested in
 * tests/unit/nav-bento-n29.test.ts.
 */

import { NAV_GROUPS, type NavGroupId } from '@/lib/services/dashboardNavModel';

export type NavTone = {
  /** Card surface + border. */
  ring: string;
  /** Hover glow (shadow). */
  glow: string;
  /** Leading accent bar. */
  bar: string;
  /** Small chip inside the card. */
  chip: string;
  /** The tab's own wash when the group is selected. */
  tab: string;
};

/** Bento spans: `hero` = 2×2, `wide` = 2×1, `unit` = 1×1 (md and up). */
export type NavSpan = 'hero' | 'wide' | 'unit';

export type NavPresentation = {
  emoji: string;
  /** One Arabic line under the module name — what the module is FOR. */
  description: string;
  span: NavSpan;
};

export const GROUP_TONES: Record<NavGroupId, NavTone> = {
  ops: {
    ring: 'border-cyan-500/25 from-cyan-500/[0.12] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(34,211,238,0.75)]',
    bar: 'bg-cyan-400',
    chip: 'bg-cyan-500/15 text-cyan-200 ring-cyan-500/30',
    tab: 'from-cyan-500/30 to-sky-500/10 ring-cyan-400/40',
  },
  communication: {
    ring: 'border-violet-500/25 from-violet-500/[0.12] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(167,139,250,0.75)]',
    bar: 'bg-violet-400',
    chip: 'bg-violet-500/15 text-violet-200 ring-violet-500/30',
    tab: 'from-violet-500/30 to-fuchsia-500/10 ring-violet-400/40',
  },
  finance: {
    ring: 'border-emerald-500/25 from-emerald-500/[0.12] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(16,185,129,0.75)]',
    bar: 'bg-emerald-400',
    chip: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30',
    tab: 'from-emerald-500/30 to-teal-500/10 ring-emerald-400/40',
  },
  settings: {
    ring: 'border-amber-500/25 from-amber-500/[0.12] to-slate-950/60',
    glow: 'hover:shadow-[0_0_38px_-16px_rgba(245,158,11,0.7)]',
    bar: 'bg-amber-400',
    chip: 'bg-amber-500/15 text-amber-200 ring-amber-500/30',
    tab: 'from-amber-500/30 to-orange-500/10 ring-amber-400/40',
  },
};

/**
 * The 32 clinic modules (+ the two imaging-centre/lab workflow modules) with the
 * owner's emoji set. `span` shapes the bento rhythm: a hero per group, wides for
 * the daily drivers, units for the rest.
 */
export const NAV_PRESENTATION: Record<string, NavPresentation> = {
  // 🏥 التشغيل اليومي
  overview: { emoji: '🏠', description: 'ملخص اليوم ومواعيده', span: 'hero' },
  appointments: { emoji: '📅', description: 'الجدول الأسبوعي واليومي', span: 'wide' },
  patients: { emoji: '👥', description: 'ابحث وافتح ملف المريض', span: 'wide' },
  'medical-files': { emoji: '📁', description: 'الأشعة والتقارير المرفوعة', span: 'unit' },
  referrals: { emoji: '↪️', description: 'تحويلات المرضى بين الجهات', span: 'unit' },
  providers: { emoji: '👨‍⚕️', description: 'الأطباء وجداولهم', span: 'unit' },
  services: { emoji: '🦷', description: 'الخدمات وأسعارها', span: 'unit' },
  team: { emoji: '👥', description: 'الأعضاء والصلاحيات', span: 'unit' },
  'before-after': { emoji: '📸', description: 'معرض حالات قبل وبعد', span: 'unit' },
  badges: { emoji: '🏆', description: 'شارات الإنجازات', span: 'unit' },
  imaging: { emoji: '🩻', description: 'صور الأشعة والبانوراما', span: 'unit' },
  lab: { emoji: '🔬', description: 'حالات المختبر', span: 'unit' },
  'imaging-requests': { emoji: '📥', description: 'طلبات التصوير الواردة', span: 'wide' },
  // 💬 التواصل
  conversations: { emoji: '💭', description: 'محادثات الذكاء الاصطناعي', span: 'hero' },
  messages: { emoji: '✉️', description: 'الرسائل مع المرضى', span: 'wide' },
  notifications: { emoji: '🔔', description: 'تنبيهات العيادة', span: 'unit' },
  leads: { emoji: '👤', description: 'العملاء المحتملون', span: 'unit' },
  'imaging-centers': { emoji: '🩻', description: 'مراكز الأشعة الشريكة', span: 'unit' },
  'referring-clinics': { emoji: '🔗', description: 'العيادات المحوِّلة', span: 'unit' },
  // 📊 المالية والنمو
  'financial-intelligence': { emoji: '💰', description: 'المستحقات والتدفق النقدي', span: 'hero' },
  payroll: { emoji: '💵', description: 'رواتب الفريق', span: 'wide' },
  analytics: { emoji: '📈', description: 'مؤشرات الأداء', span: 'unit' },
  growth: { emoji: '📊', description: 'النمو وقمع المبيعات', span: 'unit' },
  subscription: { emoji: '💳', description: 'الباقة والاستخدام', span: 'wide' },
  // ⚙️ الإعدادات
  'my-payslips': { emoji: '🎫', description: 'قسائم راتبي', span: 'unit' },
  'knowledge-base': { emoji: '📚', description: 'قاعدة معرفة المساعد', span: 'hero' },
  'public-page': { emoji: '🌐', description: 'صفحة العيادة العامة', span: 'unit' },
  'public-content': { emoji: '✏️', description: 'محتوى الصفحة العامة', span: 'unit' },
  profile: { emoji: '👤', description: 'ملفي وكلمة المرور', span: 'unit' },
  'ai-settings': { emoji: '🤖', description: 'إعدادات المساعد الذكي', span: 'wide' },
  'ai-analysis': { emoji: '🩻', description: 'تحليل الصور الطبية محلياً', span: 'wide' },
  'communication-settings': { emoji: '💬', description: 'قنوات ورسائل العيادة', span: 'unit' },
  ads: { emoji: '📢', description: 'الحملات الإعلانية', span: 'unit' },
  'clinic-setup': { emoji: '🏥', description: 'بيانات العيادة وأوقاتها', span: 'unit' },
  setup: { emoji: '⚙️', description: 'إعداد الحساب والفريق', span: 'unit' },
};

/** Never throws and never returns undefined — an unknown module still renders. */
export function navPresentation(module: string): NavPresentation {
  return NAV_PRESENTATION[module] ?? { emoji: '▫️', description: 'وحدة في لوحة التحكم', span: 'unit' };
}

export function navTone(group: NavGroupId): NavTone {
  return GROUP_TONES[group] ?? GROUP_TONES.ops;
}

/** Modules of an activity that would render without a designed card (must be []). */
export function missingPresentations(modules: readonly string[]): string[] {
  return modules.filter((module) => NAV_PRESENTATION[module] === undefined);
}

/* -------------------------------------------------------------------------- */
/* Active route                                                               */
/* -------------------------------------------------------------------------- */

/** Segments that sit where the clinic SLUG sits but are not a tenant. */
const NON_TENANT_SEGMENTS = new Set(['upgrade', 'tenants']);

/**
 * `/dashboard/{clinicSlug}/{module}[/…]` → module. Returns null for the legacy
 * `/dashboard`, the tenant picker and the `/dashboard/upgrade/{feature}` upsell
 * (`upgrade` occupies the SLUG position there) so no card is wrongly highlighted.
 * A patient file at `/dashboard/x/patients/{id}` still reports `patients` — the
 * third segment is all that matters.
 */
export function moduleFromPathname(pathname: string | null | undefined): string | null {
  if (typeof pathname !== 'string') return null;
  const parts = pathname.split('/').filter((part) => part.length > 0);
  if (parts[0] !== 'dashboard' || parts.length < 3) return null;
  const slug = parts[1];
  const module = parts[2];
  if (!slug || !module || NON_TENANT_SEGMENTS.has(slug)) return null;
  return module;
}

/** True when the current route IS this module (drives the card + tab highlight). */
export function isModuleActive(pathname: string | null | undefined, module: string): boolean {
  return moduleFromPathname(pathname) === module;
}

/* -------------------------------------------------------------------------- */
/* Live statistics                                                            */
/* -------------------------------------------------------------------------- */

/** Everything the nav cards may show — every field is optional/nullable. */
export type NavStats = {
  patientsCount?: number | null;
  todayAppointments?: number | null;
  conversations?: number | null;
  needsAttention?: number | null;
  outstanding?: number | null;
  planName?: string | null;
};

export type NavStatTone = 'info' | 'warn' | 'money' | 'plan';
export type NavStatChip = { text: string; tone: NavStatTone };

function chip(
  value: number | null | undefined,
  format: (count: number) => string,
  tone: NavStatTone
): NavStatChip | null {
  return typeof value === 'number' && Number.isFinite(value) ? { text: format(value), tone } : null;
}

/** Latin digits, like every other counter in the app (NumberTicker, KPIs). */
export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * The one statistic a module card shows. `null` = the source was unavailable (or
 * the module has no statistic) → the card shows no chip, never a fake zero.
 */
export function statForModule(module: string, stats: NavStats): NavStatChip | null {
  switch (module) {
    case 'patients':
      return chip(stats.patientsCount, (n) => `${formatCount(n)} مريض`, 'info');
    case 'appointments':
      return chip(stats.todayAppointments, (n) => `${formatCount(n)} اليوم`, 'info');
    case 'conversations':
      return chip(stats.conversations, (n) => `${formatCount(n)} جديدة`, 'info');
    case 'notifications':
      return chip(stats.needsAttention, (n) => (n === 0 ? 'لا تنبيهات' : `${formatCount(n)} بانتظار الرد`), 'warn');
    case 'financial-intelligence':
      return chip(stats.outstanding, (n) => `${formatCount(n)} مستحق`, 'money');
    case 'subscription':
      return stats.planName ? { text: stats.planName, tone: 'plan' } : null;
    default:
      return null;
  }
}

/** Chip styling per tone — kept here so the card component stays presentational. */
export const STAT_TONE_CLASS: Record<NavStatTone, string> = {
  info: 'bg-sky-500/15 text-sky-200 ring-sky-500/30',
  warn: 'bg-amber-500/15 text-amber-200 ring-amber-500/30',
  money: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/30',
  plan: 'bg-slate-800/80 text-slate-200 ring-slate-600/50',
};

/* -------------------------------------------------------------------------- */
/* Remembered tab (replaces the old "remember open groups" behaviour)         */
/* -------------------------------------------------------------------------- */

export const NAV_TAB_STORAGE_KEY = 'dashnav_tab_v2';

const GROUP_IDS: readonly string[] = NAV_GROUPS.map((group) => group.id);

/** SSR-safe: null on the server, on invalid data and on any storage error. */
export function readStoredTab(): NavGroupId | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(NAV_TAB_STORAGE_KEY);
    return raw && GROUP_IDS.includes(raw) ? (raw as NavGroupId) : null;
  } catch {
    return null;
  }
}

export function storeTab(id: NavGroupId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NAV_TAB_STORAGE_KEY, id);
  } catch {
    /* storage unavailable — the tab simply is not remembered */
  }
}
