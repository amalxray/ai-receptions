import { redirect } from 'next/navigation';
import { resolveTenantRedirect } from '@/lib/services/tenantAccess';

export const dynamic = 'force-dynamic';

/**
 * TENANT-ISOLATED DASHBOARD — legacy flat `payroll/advances` path (compat redirect).
 * Canonical URL is /dashboard/{clinicSlug}/payroll/advances.
 */
export default async function LegacyPayrollAdvancesPage() {
  redirect(await resolveTenantRedirect('/payroll/advances'));
}
