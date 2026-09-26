import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorizeClinicRequest, roleDenied, DATA_ROLES, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { notifyReferral } from '@/lib/notifications/referralNotifier';
import { logEvent } from '@/lib/server/logging';

/**
 * CROSS-TENANT IMAGING REFERRALS.
 *
 * A dental clinic (referring_org) creates an imaging_request owned by an
 * independent imaging center (target). Authorized ONLY when:
 *   1) the caller is a member of the referring clinic (clinic_id),
 *   2) the patient belongs to that referring clinic,
 *   3) an ACCEPTED relationship exists between the two organizations
 *      (either direction), and
 *   4) the target is an imaging_center activity.
 *
 * The imaging center never sees the full patient file — only the fields the
 * scenario requires (name/reference + the request). This is why we carry
 * patient_ref as the display reference alongside patient_id.
 */
export const runtime = 'nodejs';

const createSchema = z.object({
  clinic_id: z.string().uuid(), // referring organization
  target_imaging_center_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  service_id: z.string().uuid().nullable().optional(), // structured link → clinic_services
  referring_provider_id: z.string().uuid().nullable().optional(),
  priority: z.enum(['routine', 'urgent']).optional().default('routine'),
  requested_service: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'بيانات غير صحيحة', details: parsed.error.errors }, { status: 400 });
    }
    const { clinic_id: referringClinicId, target_imaging_center_id: targetId, patient_id: patientId } = parsed.data;

    const auth = await authorizeClinicRequest(req, referringClinicId);
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
    const gate = roleDenied(auth, DATA_ROLES);
    if (gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // 2) patient belongs to the referring clinic.
    const { data: patient } = await supabaseAdmin
      .from('patients')
      .select('id, clinic_id, full_name')
      .eq('id', patientId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!patient) return NextResponse.json({ error: 'المريض غير موجود' }, { status: 404 });
    if (patient.clinic_id !== referringClinicId) {
      return NextResponse.json({ error: 'المريض لا ينتمي لهذه العيادة' }, { status: 403 });
    }

    // 3) accepted relationship (either direction).
    const { data: rel } = await supabaseAdmin
      .from('organization_relationships')
      .select('id, status')
      .or(`and(source_org_id.eq.${referringClinicId},target_org_id.eq.${targetId}),and(source_org_id.eq.${targetId},target_org_id.eq.${referringClinicId})`)
      .eq('status', 'accepted')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (!rel) {
      return NextResponse.json({ error: 'لا توجد علاقة مقبولة مع مركز التصوير' }, { status: 403 });
    }

    // 3b) service_id must belong to the REFERRING clinic's own catalog (the
    // billable service is the imaging center's, mirrored in its clinic_services).
    const serviceId = parsed.data.service_id ?? null;
    let serviceName: string | null = parsed.data.requested_service ?? null;
    if (serviceId) {
      const { data: svc } = await supabaseAdmin
        .from('clinic_services')
        .select('id, clinic_id, name')
        .eq('id', serviceId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!svc || svc.clinic_id !== targetId) {
        return NextResponse.json({ error: 'الخدمة المطلوبة غير معرفة لدى مركز التصوير' }, { status: 400 });
      }
      serviceName = svc.name ?? serviceName;
    }

    // 4) target is an imaging center.
    const { data: target } = await supabaseAdmin
      .from('clinics')
      .select('id, activity_type')
      .eq('id', targetId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!target || target.activity_type !== 'imaging_center') {
      return NextResponse.json({ error: 'الجهة المستهدفة ليست مركز تصوير' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('imaging_requests')
      .insert({
        clinic_id: targetId,
        referring_clinic_id: referringClinicId,
        patient_id: patientId,
        patient_ref: patient.full_name,
        service_id: serviceId,
        referring_provider_id: parsed.data.referring_provider_id ?? null,
        requested_service: parsed.data.requested_service ?? null,
        notes: parsed.data.notes ?? null,
        priority: parsed.data.priority,
        status: 'submitted',
        created_at: new Date().toISOString(),
      })
      .select('id, patient_ref, requested_service, status, notes, created_at')
      .single();
    if (error) throw new Error(error.message);
    logEvent('imaging_referral_created', {
      referring_clinic_id: referringClinicId,
      imaging_center_id: targetId,
      patient_id: patientId,
      request_id: data.id,
      priority: parsed.data.priority,
    });

    // B20 — tell the imaging center (bell + toast). Fail-safe: a notification
    // failure never rolls back the referral that already exists.
    const { data: referrer } = await supabaseAdmin
      .from('clinics')
      .select('name')
      .eq('id', referringClinicId)
      .maybeSingle();
    await notifyReferral({
      recipientClinicId: targetId,
      requestId: data.id,
      event: 'referral_submitted',
      patientRef: patient.full_name,
      counterpartName: referrer?.name ?? null,
      serviceName,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    logEvent('imaging_referral_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}

/**
 * List referrals for the caller's organization.
 *
 * `direction` (B20, additive — no param keeps the original referring-side
 * behaviour):
 *   outgoing (default) → referrals THIS org sent  (I am `referring_clinic_id`)
 *   incoming           → referrals THIS org received (I own the activity side)
 *   all                → both
 *
 * Rows with no `referring_clinic_id` are the center's OWN walk-in requests, not
 * cross-tenant referrals — they stay in the imaging-requests inbox and are never
 * listed here (in every mode).
 *
 * `partners` is a lookup map (clinic id → name/slug/activity) so the list UI can
 * label the other side without one request per row.
 */
const REFERRAL_DIRECTIONS = ['outgoing', 'incoming', 'all'] as const;
type ReferralDirectionFilter = (typeof REFERRAL_DIRECTIONS)[number];

const REFERRAL_LIST_COLS =
  'id, clinic_id, referring_clinic_id, patient_id, patient_id_center, patient_ref, requested_service, service_id, modality, status, imaging_status, priority, notes, scheduled_at, completed_at, created_at, updated_at';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id') ?? '';
    const directionParam = url.searchParams.get('direction');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });
    // Fail-closed: an explicit-but-unknown direction is a client bug, not a
    // reason to silently widen the query.
    if (directionParam && !REFERRAL_DIRECTIONS.includes(directionParam as ReferralDirectionFilter)) {
      return NextResponse.json({ error: 'direction غير صحيح' }, { status: 400 });
    }
    const direction = (directionParam ?? 'outgoing') as ReferralDirectionFilter;

    const auth = await authorizeClinicRequest(req, clinicId);
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
    const gate = roleDenied(auth, DATA_ROLES);
    if (gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    let query = supabaseAdmin
      .from('imaging_requests')
      .select(REFERRAL_LIST_COLS)
      .is('deleted_at', null)
      // Never a self-request: a referral always has a referring organization.
      .not('referring_clinic_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (direction === 'outgoing') {
      query = query.eq('referring_clinic_id', clinicId);
    } else if (direction === 'incoming') {
      query = query.eq('clinic_id', clinicId);
    } else {
      query = query.or(`referring_clinic_id.eq.${clinicId},clinic_id.eq.${clinicId}`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // One extra query for every counterpart name instead of N lookups.
    const counterpartIds = Array.from(
      new Set(
        (data ?? [])
          .flatMap((row) => [row.clinic_id, row.referring_clinic_id])
          .filter((id): id is string => typeof id === 'string' && id !== clinicId),
      ),
    );
    let partners: Record<string, { name: string | null; slug: string | null; activity_type: string | null }> = {};
    if (counterpartIds.length > 0) {
      const { data: clinics } = await supabaseAdmin
        .from('clinics')
        .select('id, name, slug, activity_type')
        .in('id', counterpartIds);
      partners = Object.fromEntries(
        (clinics ?? []).map((c) => [c.id, { name: c.name ?? null, slug: c.slug ?? null, activity_type: c.activity_type ?? null }]),
      );
    }

    return NextResponse.json({ data: data ?? [], direction, partners });
  } catch (err) {
    logEvent('imaging_referral_get_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}