import { redirect } from 'next/navigation';
import { resolveTenantRedirect } from '@/lib/services/tenantAccess';

export const dynamic = 'force-dynamic';

/**
 * TENANT-ISOLATED DASHBOARD — legacy flat `media-library` path (compat redirect).
 * Canonical URL is /dashboard/{clinicSlug}/media-library.
 */
export default async function LegacyMediaLibraryPage() {
  redirect(await resolveTenantRedirect('/media-library'));
}
