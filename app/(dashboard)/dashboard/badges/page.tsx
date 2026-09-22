import { redirect } from 'next/navigation';
import { resolveTenantRedirect } from '@/lib/services/tenantAccess';

export const dynamic = 'force-dynamic';

/**
 * TENANT-ISOLATED DASHBOARD — legacy flat `badges` path (compat redirect).
 * Canonical URL is /dashboard/{clinicSlug}/badges.
 * Registered in DASHBOARD_MODULES 20261016 (pre-existing gap: the tenant page
 * existed but the module list — and therefore this redirect — did not).
 */
export default async function LegacyBadgesPage() {
  redirect(await resolveTenantRedirect('/badges'));
}
