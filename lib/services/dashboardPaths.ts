/**
 * Dashboard tenant path helpers — PURE (client-safe, no server imports).
 *
 * Canonical dashboard URL is `/dashboard/{clinicSlug}/{module}`. These helpers
 * validate a `?next=` value so login can never be an open redirect, and build
 * the canonical path from a module name. The tenant slug — not React state and
 * not a client-supplied clinic_id — is the source of truth for routing.
 */

const MODULE_SEGMENT = /^[a-z0-9-]+$/;
export const DASHBOARD_MODULES = [
  'overview', 'appointments', 'patients', 'providers', 'services',
  'conversations', 'leads', 'notifications', 'knowledge', 'knowledge-base',
  'ai-settings', 'communication-settings', 'clinic-setup', 'public-page',
  'ads', 'analytics', 'growth', 'financial-intelligence', 'imaging', 'lab',
  'subscription', 'team', 'setup', 'medical-files', 'messages', 'imaging-centers',
  // imaging-center workflow modules (activity-specific capabilities)
  'imaging-requests', 'referring-clinics',
  // PHASE L — public page content builder (theme/achievements/testimonials/articles/news)
  'public-content',
  // PHASE K — account self-service (profile + password change)
  'profile',
  // PAYROLL PHASE 2 (20261016) — payroll module + employee self-service
  'payroll',
  'my-payslips',
  // Registered late (pre-existing gap: the tenant pages existed but the module
  // list — and therefore the legacy compat redirects — did not).
  'badges',
  'before-after',
] as const;
export type DashboardModule = (typeof DASHBOARD_MODULES)[number];

/**
 * True when `path` is one of the safe internal dashboard destinations:
 *   /dashboard                      (legacy index)
 *   /dashboard/tenants              (multi-tenant picker)
 *   /dashboard/{clinicSlug}[/...]   (canonical tenant route)
 * Absolute URLs, protocol-relative URLs, `..`, backslashes and query-only
 * tricks are rejected.
 */
export function isSafeDashboardPath(path: string | null | undefined): boolean {
  if (!path) return false;
  if (path.startsWith('//') || path.includes('\\') || path.includes('..') || path.includes(':')) {
    return false;
  }
  const segments = path.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return false;
  if (segments[0] !== 'dashboard') return false;
  if (segments.length === 1) return true; // /dashboard
  if (segments.length === 2 && segments[1] === 'tenants') return true;
  // /dashboard/{clinicSlug}[/...] — every segment must be a safe token.
  return segments.slice(1).every((s) => MODULE_SEGMENT.test(s));
}

/** `/dashboard/{clinicSlug}/{module}` — canonical tenant-scoped URL. */
export function tenantDashboardUrl(clinicSlug: string, module: DashboardModule | string): string {
  return `/dashboard/${encodeURIComponent(clinicSlug)}/${module}`;
}

/** `/login?next=/dashboard/{clinicSlug}/overview` — public-space owner entry. */
export function ownerLoginUrl(clinicSlug: string): string {
  return `/login?next=${encodeURIComponent(tenantDashboardUrl(clinicSlug, 'overview'))}`;
}

/**
 * True when `path` is a team-invitation link: `/invite/{token}` (#38).
 *
 * The token is the only allowed segment and must look like the generated
 * credential (hex, 32–128 chars) — so `/login?next=/invite/<token>` can be
 * honored after sign-in without ever becoming an open redirect.
 */
export function isSafeInvitePath(path: string | null | undefined): boolean {
  if (!path) return false;
  if (path.startsWith('//') || path.includes('\\') || path.includes('..') || path.includes(':')) {
    return false;
  }
  const segments = path.split('/').filter((s) => s.length > 0);
  return segments.length === 2 && segments[0] === 'invite' && /^[a-f0-9]{32,128}$/i.test(segments[1]);
}

/**
 * True when `path` is a safe internal admin destination (/admin[/segment...]).
 * Same rejection rules as isSafeDashboardPath (no absolute URLs, `..`, `\`, `:`).
 */
export function isSafeAdminPath(path: string | null | undefined): boolean {
  if (!path) return false;
  if (path.startsWith('//') || path.includes('\\') || path.includes('..') || path.includes(':')) {
    return false;
  }
  const segments = path.split('/').filter((s) => s.length > 0);
  if (segments.length === 0 || segments[0] !== 'admin') return false;
  return segments.slice(1).every((s) => MODULE_SEGMENT.test(s));
}