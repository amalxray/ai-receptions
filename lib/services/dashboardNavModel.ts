/**
 * PHASE K — Dashboard navigation grouping model.
 *
 * Pure data + pure functions (no React) so unit tests can verify grouping
 * without rendering. DashboardNav consumes this to render collapsible groups,
 * while `getActivityNavigation` (the capability model) stays the single source
 * of WHICH modules exist for an activity. Unknown modules fall back to 'ops'
 * so a future module can never silently vanish from navigation.
 */

export type NavGroupId = 'ops' | 'communication' | 'finance' | 'settings';

export type NavModule = { module: string; label: string; icon?: string };

export type NavGroup = { id: NavGroupId; label: string; icon: string };

export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'ops', label: 'التشغيل اليومي', icon: '🏥' },
  { id: 'communication', label: 'التواصل', icon: '💬' },
  { id: 'finance', label: 'المالية والنمو', icon: '📊' },
  { id: 'settings', label: 'الإعدادات والحساب', icon: '⚙️' },
];

/** module → group mapping (single source of truth for placement). */
const MODULE_GROUPS: Record<string, NavGroupId> = {
  overview: 'ops',
  appointments: 'ops',
  patients: 'ops',
  'imaging-requests': 'ops',
  'medical-files': 'ops',
  referrals: 'ops',
  providers: 'ops',
  team: 'ops',
  conversations: 'communication',
  messages: 'communication',
  notifications: 'communication',
  leads: 'communication',
  'referring-clinics': 'communication',
  'imaging-centers': 'communication',
  'financial-intelligence': 'finance',
  revenues: 'finance',
  expenses: 'finance',
  analytics: 'finance',
  growth: 'finance',
  subscription: 'finance',
  // Payroll (20261016): money modules live in the finance group; "my payslips"
  // is a personal (account) page, so it sits under settings with the profile.
  payroll: 'finance',
  'my-payslips': 'settings',
  'knowledge-base': 'settings',
  'ai-settings': 'settings',
  'ai-analysis': 'settings',
  'communication-settings': 'settings',
  ads: 'settings',
  setup: 'settings',
  'clinic-setup': 'settings',
  'public-page': 'settings',
  'public-content': 'settings',
  'before-after': 'ops',
  badges: 'ops',
  profile: 'settings',
};

// #43 — module → effective permission keys. A module with alternatives remains
// visible when any one of its supported permissions is granted.
export const NAV_MODULE_PERMISSIONS: Partial<Record<string, string | readonly string[]>> = {
  overview: 'view_overview',
  appointments: 'view_appointments',
  patients: 'view_patients',
  'medical-files': 'view_medical_files',
  conversations: 'view_conversations',
  messages: 'view_messages',
  reviews: 'view_reviews',
  'imaging-requests': 'view_imaging_requests',
  referrals: 'view_imaging_requests',
  leads: 'view_leads',
  'financial-intelligence': 'view_financial',
  revenues: ['view_financial', 'manage_invoices', 'manage_payments'],
  expenses: ['view_financial', 'manage_expenses'],
  analytics: 'view_analytics',
  growth: 'view_growth',
  team: 'manage_team',
  'communication-settings': 'manage_settings',
  ads: 'manage_ads',
  'knowledge-base': 'manage_knowledge',
  'public-page': 'view_public_page',
  'public-content': 'manage_public_page',
  subscription: 'manage_subscription',
  payroll: 'view_payroll',
  'my-payslips': 'view_own_payslips',
};

export function hasNavModulePermission(module: string, permissions: ReadonlySet<string>): boolean {
  const required = NAV_MODULE_PERMISSIONS[module];
  if (required === undefined) return true;
  return typeof required === 'string'
    ? permissions.has(required)
    : required.some((permission) => permissions.has(permission));
}

export function groupForModule(module: string): NavGroupId {
  return MODULE_GROUPS[module] ?? 'ops';
}

export type GroupedNav = NavGroup & { items: NavModule[] };

/** Bucket links into NAV_GROUPS order; per-group items keep their input order. */
export function groupNavLinks(links: NavModule[]): GroupedNav[] {
  const buckets = new Map<NavGroupId, NavModule[]>();
  for (const link of links) {
    const id = groupForModule(link.module);
    const bucket = buckets.get(id) ?? [];
    bucket.push(link);
    buckets.set(id, bucket);
  }
  return NAV_GROUPS.map((group) => ({ ...group, items: buckets.get(group.id) ?? [] }));
}
