import { redirect } from 'next/navigation';
import { resolveTenantRedirect } from '@/lib/services/tenantAccess';

export const dynamic = 'force-dynamic';

/**
 * TENANT-ISOLATED DASHBOARD — legacy flat `before-after` path (compat redirect).
 * Canonical URL is /dashboard/{clinicSlug}/before-after.
 * Registered in DASHBOARD_MODULES 20261016 (pre-existing gap).
 */
export default async function LegacyBeforeAfterPage() {
  redirect(await resolveTenantRedirect('/before-after'));
}
