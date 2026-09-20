import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorizeClinicRequest, roleDenied, DATA_ROLES } from '@/lib/services/clinicAuthorization';
import { logEvent } from '@/lib/server/logging';

/**
 * PARTNER IMAGING SERVICES (referral dropdown fix).
 *
 * GET /api/imaging/partner-services?clinic_id=<mine>&center_id=<imaging center>
 *
 * GET /api/clinic/services authorizes membership of the requested clinic, so a
 * REFERRING clinic could never read the imaging center's catalog (403 → empty
 * "نوع التصوير" dropdown in TransferDialog). This endpoint authorizes the
 * CALLER against their OWN clinic, then — only when an ACCEPTED relationship
 * exists between the two organizations — returns the imaging center's active
 * catalog (id, name, price). The referrals API requires service_id to belong
 * to the target center's clinic_services, so this is exactly the valid set.
 */
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id') ?? '';
    const centerId = url.searchParams.get('center_id') ?? '';
    if (!clinicId || !centerId) {
      return NextResponse.json({ error: 'clinic_id و center_id مطلوبان' }, { status: 400 });
    }

    const auth = await authorizeClinicRequest(req, clinicId);
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
    const gate = roleDenied(auth, DATA_ROLES);
    if (gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Accepted relationship (either direction) — same gate as referrals POST.
    const { data: rel } = await supabaseAdmin
      .from('organization_relationships')
      .select('id')
      .or(
        `and(source_org_id.eq.${clinicId},target_org_id.eq.${centerId}),and(source_org_id.eq.${centerId},target_org_id.eq.${clinicId})`,
      )
      .eq('status', 'accepted')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (!rel) {
      return NextResponse.json({ error: 'لا توجد علاقة مقبولة مع مركز التصوير' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('clinic_services')
      .select('id, name, pricing_type, price, price_min, price_max')
      .eq('clinic_id', centerId)
      .eq('active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    logEvent('imaging_partner_services_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'تعذر تحميل خدمات مركز التصوير' }, { status: 500 });
  }
}
