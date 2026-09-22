// #43 — Display grouping + effective permission resolution for the member
// profile UI. Kept PURE and outside the component so the invariants that broke
// this page once (a permission that renders nowhere, a role whose base is
// silently empty) are unit-testable without a DOM.

import { ROLE_DEFAULTS, ALL_PERMISSION_KEYS, type PermissionKey } from './permissions';

/**
 * Grouped presentation of the registry (Arabic section titles, canonical order).
 * EVERY key of PERMISSIONS must appear exactly once — enforced by
 * tests/unit/permission-manager.test.ts.
 */
export const PERMISSION_GROUPS: ReadonlyArray<readonly [string, readonly PermissionKey[]]> = [
  ['عام', ['view_overview']],
  ['المواعيد', ['view_appointments', 'manage_appointments']],
  ['المرضى', ['view_patients', 'manage_patients', 'delete_patients']],
  ['الملفات الطبية', ['view_medical_files', 'manage_medical_files']],
  ['الرسائل', ['view_messages', 'send_messages', 'view_conversations']],
  ['التصوير', ['view_imaging_requests', 'manage_imaging_requests']],
  ['العملاء المحتملون', ['view_leads', 'manage_leads']],
  ['المالية', ['view_financial', 'manage_invoices', 'manage_payments', 'manage_expenses']],
  ['التحليلات', ['view_analytics', 'view_growth']],
  ['الإدارة', ['manage_team', 'manage_settings', 'manage_ads', 'manage_knowledge', 'manage_subscription']],
  ['الصفحة العامة', ['view_public_page', 'manage_public_page']],
  ['الرواتب', ['view_payroll', 'manage_payroll', 'view_advances', 'manage_advances', 'view_own_payslips']],
];

/** Flat list of every key the UI actually renders (duplicates preserved). */
export const GROUPED_PERMISSION_KEYS: readonly PermissionKey[] =
  PERMISSION_GROUPS.flatMap(([, keys]) => keys);

/** Registry keys that no group renders — must always be empty. */
export function permissionsMissingFromGroups(): PermissionKey[] {
  const grouped = new Set<string>(GROUPED_PERMISSION_KEYS);
  return ALL_PERMISSION_KEYS.filter((key) => !grouped.has(key));
}

/** Keys rendered more than once (would produce duplicate toggles). */
export function duplicatedGroupedPermissions(): PermissionKey[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of GROUPED_PERMISSION_KEYS) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return Array.from(duplicates) as PermissionKey[];
}

export type CustomRoleLike = { name: string; permissions: unknown };

/**
 * The permission BASE of a member, per the resolution order the server uses
 * (lib/auth/permissions.getUserPermissions):
 *   owner → everything, always
 *   a system role → its ROLE_DEFAULTS
 *   otherwise → a clinic custom role carrying that name
 * Unknown roles resolve to an EMPTY base (least privilege), never to a default.
 */
export function basePermissionsForRole(
  role: string,
  customRoles: readonly CustomRoleLike[] = []
): Set<PermissionKey> {
  if (role === 'owner') return new Set(ALL_PERMISSION_KEYS);

  const system = ROLE_DEFAULTS[role];
  if (system) return new Set(system);

  const custom = customRoles.find((r) => r.name === role);
  if (custom && Array.isArray(custom.permissions)) {
    return new Set(custom.permissions.filter((p): p is PermissionKey => typeof p === 'string'));
  }
  return new Set<PermissionKey>();
}

/** True when a role needs the custom-role lookup to resolve its base. */
export function isCustomRoleName(role: string): boolean {
  return role !== 'owner' && !(role in ROLE_DEFAULTS);
}

/**
 * Applies per-user overrides on top of a base: `true` grants, `false` revokes.
 * Returns both the switch state and whether it differs from the role base
 * (the "مخصص" badge).
 */
export function resolvePermissionState(
  key: PermissionKey,
  base: Set<PermissionKey>,
  overrides: Record<string, boolean>
): { enabled: boolean; isOverride: boolean } {
  const isOverride = Object.prototype.hasOwnProperty.call(overrides, key);
  if (isOverride) return { enabled: overrides[key] === true, isOverride: true };
  return { enabled: base.has(key), isOverride: false };
}
