import { redirect } from 'next/navigation';
import { resolveTenantRedirect } from '@/lib/services/tenantAccess';

export const dynamic = 'force-dynamic';

/** Legacy flat expenses URL; canonical page is /dashboard/{clinicSlug}/expenses. */
export default async function LegacyExpensesPage() {
  redirect(await resolveTenantRedirect('/expenses'));
}
