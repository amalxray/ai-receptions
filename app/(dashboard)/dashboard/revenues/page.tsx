import { redirect } from 'next/navigation';
import { resolveTenantRedirect } from '@/lib/services/tenantAccess';

export const dynamic = 'force-dynamic';

/** Legacy flat revenue URL; canonical page is /dashboard/{clinicSlug}/revenues. */
export default async function LegacyRevenuesPage() {
  redirect(await resolveTenantRedirect('/revenues'));
}
