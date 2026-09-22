import { redirect } from 'next/navigation';
import { resolveTenantRedirect } from '@/lib/services/tenantAccess';

export const dynamic = 'force-dynamic';

/**
 * TENANT-ISOLATED DASHBOARD — legacy flat `my-payslips` path (compat redirect).
 * Canonical URL is /dashboard/{clinicSlug}/my-payslips.
 */
export default async function LegacyMyPayslipsPage() {
  redirect(await resolveTenantRedirect('/my-payslips'));
}
