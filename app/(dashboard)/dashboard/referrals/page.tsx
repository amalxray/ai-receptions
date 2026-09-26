import { redirect } from 'next/navigation';
import { resolveTenantRedirect } from '@/lib/services/tenantAccess';

export const dynamic = 'force-dynamic';

/** Legacy flat `referrals` path (compat redirect) — B20. */
export default async function LegacyReferralsPage() {
  redirect(await resolveTenantRedirect('/referrals'));
}
