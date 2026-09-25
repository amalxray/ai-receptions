import { NextResponse } from 'next/server';
import { resolvePublicClinic } from '@/lib/services/clinics';
import { resolveTenantPublicUrl } from '@/lib/vercel/tenantLinks';

/**
 * STEP 15D / Digital Healthcare Space — QR destination route.
 *
 * `/q/{public-id}` redirects (302) to the canonical public space (activity-aware
 * since Phase E) on the tenant's OWN subdomain, or to the reachable
 * compatibility page `/c/{slug}` while that host is still unregistered on the
 * Vercel project (P1 readiness fallback). The public_id remains the opaque,
 * stable identifier (migration 20260832_clinic_public_id) so printed QR codes
 * survive slug changes AND the canonical migration. Exposes nothing but the
 * redirect itself.
 */
export async function GET(
  _request: Request,
  { params }: { params: { publicId: string } }
): Promise<NextResponse> {
  const publicId = params.publicId?.trim();
  if (!publicId || publicId.length > 128) {
    return new NextResponse(null, { status: 404 });
  }

  const clinic = await resolvePublicClinic({ publicId });
  if (!clinic) {
    return new NextResponse(null, { status: 404 });
  }

  // A PRINTED QR code must never land on a host that cannot complete a TLS
  // handshake, so the destination is readiness-aware rather than blindly
  // canonical (P1). Skipping the lookup made 4 of 6 live QR codes dead.
  const target = await resolveTenantPublicUrl(clinic.slug);
  return NextResponse.redirect(new URL(target, _request.url), 302);
}
