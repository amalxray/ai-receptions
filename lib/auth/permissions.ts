// #43 — Flexible permission system: registry, role defaults, per-user overrides.
//
// Model (Global by Default):
//   effective = ROLE_DEFAULTS[role]  ⊕  custom_roles.permissions (role=name)
//                           ⊕  user_permissions overrides (per user/clinic)
//   `owner` is always granted EVERY permission and can never be restricted.
//
// Resolution runs SERVER-SIDE only (service-role client). The UI mirrors
// defaults locally for optimistic rendering but real enforcement is in APIs.

import { supabaseAdmin } from '@/lib/supabase/admin';

export const PERMISSIONS = {
  view_overview: 'الرئيسية',
  view_appointments: 'عرض المواعيد',
  manage_appointments: 'إدارة المواعيد',
  view_patients: 'عرض المرضى',
  manage_patients: 'إدارة المرضى',
  delete_patients: 'حذف المرضى',
  view_medical_files: 'عرض الملفات الطبية',
  manage_medical_files: 'إدارة الملفات الطبية',
  view_messages: 'عرض الرسائل',
  send_messages: 'إرسال الرسائل',
  view_conversations: 'المحادثات',
  view_imaging_requests: 'طلبات التصوير',
  manage_imaging_requests: 'إدارة طلبات التصوير',
  view_leads: 'العملاء المحتملون',
  manage_leads: 'إدارة العملاء المحتملين',
  view_financial: 'المالية',
  manage_invoices: 'الفواتير',
  manage_payments: 'المدفوعات',
  manage_expenses: 'المصروفات',
  view_analytics: 'التحليلات',
  view_growth: 'النمو',
  manage_team: 'إدارة الفريق',
  manage_settings: 'إعدادات العيادة',
  manage_ads: 'الإعلانات',
  manage_knowledge: 'قاعدة المعرفة',
  manage_subscription: 'الاشتراك',
  view_public_page: 'الصفحة العامة',
  manage_public_page: 'محتوى الصفحة العامة',
  // Phase 2 payroll (20261016)
  view_payroll: 'عرض الرواتب',
  manage_payroll: 'إدارة الرواتب',
  view_advances: 'عرض السلف',
  manage_advances: 'إدارة السلف',
  view_own_payslips: 'عرض قسائمي',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(key: string): key is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, key);
}

export const ROLE_DEFAULTS: Record<string, PermissionKey[]> = {
  owner: ALL_PERMISSION_KEYS,
  manager: [
    'view_overview', 'view_appointments', 'manage_appointments',
    'view_patients', 'manage_patients', 'delete_patients',
    'view_medical_files', 'manage_medical_files',
    'view_messages', 'send_messages', 'view_conversations',
    'view_imaging_requests', 'manage_imaging_requests',
    'view_leads', 'manage_leads',
    'view_financial', 'manage_invoices', 'manage_payments', 'manage_expenses',
    'view_analytics', 'manage_team', 'manage_settings', 'manage_ads',
    'manage_knowledge', 'view_public_page', 'manage_public_page',
    'view_payroll', 'manage_payroll', 'view_advances', 'manage_advances', 'view_own_payslips',
  ],
  doctor: [
    'view_overview', 'view_appointments', 'view_patients',
    'view_medical_files', 'manage_medical_files',
    'view_messages', 'send_messages', 'view_conversations',
    'view_imaging_requests', 'manage_imaging_requests',
    // Own pay only: a doctor sees their payslips, never the payroll module.
    'view_own_payslips',
  ],
  receptionist: [
    'view_overview', 'view_appointments', 'manage_appointments',
    'view_patients', 'manage_patients', 'view_medical_files',
    'view_messages', 'send_messages', 'view_conversations',
    'view_imaging_requests', 'manage_imaging_requests',
    'view_leads', 'manage_leads',
    'view_own_payslips',
  ],
  accountant: [
    'view_overview', 'view_financial',
    'manage_invoices', 'manage_payments', 'manage_expenses',
    'view_analytics',
    'view_payroll', 'manage_payroll', 'view_advances', 'manage_advances', 'view_own_payslips',
  ],
  staff: ['view_overview', 'view_own_payslips'],
};

/**
 * Flexible-layer resolution result.
 *  - `permissions`: the effective set (base ⊕ overrides) — sidebar/nav rendering.
 *  - `overrides`: EXPLICIT per-user decisions only. The gate needs this to
 *    distinguish “never granted” from “explicitly revoked”, which the collapsed
 *    Set cannot express.
 */
export interface UserPermissionState {
  permissions: Set<PermissionKey>;
  overrides: Map<PermissionKey, boolean>;
}

/** Short in-process cache — avoids a DB round-trip per API call. */
const cache = new Map<string, UserPermissionState>();
const CACHE_TTL_MS = 60_000;
const cacheTimestamps = new Map<string, number>();

export async function getUserPermissions(
  userId: string,
  clinicId: string,
  role: string,
  client: Pick<ReturnType<typeof supabaseAdmin.from>, 'select'> | any = supabaseAdmin
): Promise<Set<PermissionKey>> {
  return (await getUserPermissionState(userId, clinicId, role, client)).permissions;
}

export async function getUserPermissionState(
  userId: string,
  clinicId: string,
  role: string,
  client: Pick<ReturnType<typeof supabaseAdmin.from>, 'select'> | any = supabaseAdmin
): Promise<UserPermissionState> {
  // Owner is untouchable: every permission, always, and nothing is overridable.
  if (role === 'owner') {
    return { permissions: new Set(ALL_PERMISSION_KEYS), overrides: new Map() };
  }


  const cacheKey = `${userId}:${clinicId}`;
  const cachedAt = cacheTimestamps.get(cacheKey) ?? 0;
  if (cache.has(cacheKey) && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cache.get(cacheKey)!;
  }

  // 1) Custom role with the same name as the member's role wins over defaults.
  let basePermissions: PermissionKey[];
  try {
    const { data: customRole } = await client
      .from('custom_roles')
      .select('permissions')
      .eq('clinic_id', clinicId)
      .eq('name', role)
      .maybeSingle();

    basePermissions = customRole?.permissions
      ? (customRole.permissions as string[]).filter(isPermissionKey)
      : ROLE_DEFAULTS[role] ?? [];
  } catch {
    // DB hiccup → fall back to static defaults instead of hard-failing every
    // downstream request. Static role gates still enforce base access.
    basePermissions = ROLE_DEFAULTS[role] ?? [];
  }

  const permissions = new Set<PermissionKey>(basePermissions);

  // 2) Per-user overrides apply on top (enabled → grant, disabled → revoke).
  //    Kept as an explicit map as well, so a caller can tell a revocation from
  //    a permission that was simply never part of the role base.
  const overrideMap = new Map<PermissionKey, boolean>();
  try {
    const { data: overrides } = await client
      .from('user_permissions')
      .select('permission_key, enabled')
      .eq('user_id', userId)
      .eq('clinic_id', clinicId);

    (overrides ?? []).forEach(({ permission_key, enabled }: { permission_key: string; enabled: boolean }) => {
      if (!isPermissionKey(permission_key)) return;
      overrideMap.set(permission_key, enabled === true);
      if (enabled) permissions.add(permission_key);
      else permissions.delete(permission_key);
    });
  } catch {
    /* keep the base set on failure */
  }

  const state: UserPermissionState = { permissions, overrides: overrideMap };
  cache.set(cacheKey, state);
  cacheTimestamps.set(cacheKey, Date.now());
  return state;
}

export function hasPermission(perms: Set<PermissionKey>, key: PermissionKey): boolean {
  return perms.has(key);
}

export function clearPermissionCache(userId?: string): void {
  if (userId) {
    for (const key of Array.from(cache.keys())) {
      if (key.startsWith(`${userId}:`)) {
        cache.delete(key);
        cacheTimestamps.delete(key);
      }
    }
  } else {
    cache.clear();
    cacheTimestamps.clear();
  }
}
