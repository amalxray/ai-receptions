import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorizeClinicRequest, roleDenied, DATA_ROLES } from '@/lib/services/clinicAuthorization';
import { referralDirection } from '@/lib/services/referralWorkflow';
import { logEvent } from '@/lib/server/logging';

/**
 * REFERRAL DETAIL (B20) — one read model for BOTH sides of a referral.
 *
 * Access gate: the caller must be a member of EITHER party (the activity that
 * owns the request OR the referring organization). Neither tenant can probe the
 * other's referrals: a foreign clinic_id gets 403, never an empty 200.
 *
 * The payload is deliberately composed of what the DETAIL page renders — the
 * request + the counterpart org, the shared patient reference, the produced
 * files (metadata only; binaries stay behind the existing signed-URL endpoint),
 * the finalized study and the immutable workflow timeline.
 */
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { requestId: string } }) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id') ?? '';
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const auth = await authorizeClinicRequest(req, clinicId);
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
    const gate = roleDenied(auth, DATA_ROLES);
    if (gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: request } = await supabaseAdmin
      .from('imaging_requests')
      .select(
        'id, clinic_id, referring_clinic_id, patient_id, patient_id_center, patient_ref, requested_service, service_id, modality, status, imaging_status, priority, notes, scheduled_at, completed_at, created_at, updated_at',
      )
      .eq('id', params.requestId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!request) return NextResponse.json({ error: 'التحويل غير موجود' }, { status: 404 });

    const direction = referralDirection(clinicId, request);
    if (!direction) return NextResponse.json({ error: 'لا تملك صلاحية الاطلاع على هذا التحويل' }, { status: 403 });

    const counterpartId = direction === 'incoming' ? request.referring_clinic_id : request.clinic_id;

    const [counterpartRes, patientRes, serviceRes, filesRes, resultRes, timelineRes] = await Promise.all([
      counterpartId
        ? supabaseAdmin.from('clinics').select('id, name, slug, activity_type').eq('id', counterpartId).maybeSingle()
        : Promise.resolve({ data: null }),
      request.patient_id
        ? supabaseAdmin.from('patients').select('id, full_name, phone').eq('id', request.patient_id).maybeSingle()
        : Promise.resolve({ data: null }),
      request.service_id
        ? supabaseAdmin.from('clinic_services').select('id, name, price').eq('id', request.service_id).maybeSingle()
        : Promise.resolve({ data: null }),
      // Files PRODUCED BY THE ACTIVITY for this referral. The referring clinic
      // must never receive the center's unrelated patient files, and the
      // metadata of a partner file belongs to its producer.
      supabaseAdmin
        .from('medical_files')
        .select('id, clinic_id, patient_id, imaging_request_id, file_type, mime_type, size_bytes, original_filename, created_at')
        .eq('imaging_request_id', request.id)
        .eq('clinic_id', request.clinic_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('imaging_results')
        .select('id, status, report_text, report_file_id, images, finalized_at, created_at')
        .eq('imaging_request_id', request.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('workflow_audit')
        .select('id, from_status, to_status, actor_role, reason, created_at')
        .eq('entity_type', 'imaging_request')
        .eq('entity_id', request.id)
        .order('created_at', { ascending: true })
        .limit(100),
    ]);

    return NextResponse.json({
      data: {
        direction,
        request,
        counterpart: counterpartRes.data ?? null,
        patient: patientRes.data ?? null,
        service: serviceRes.data ?? null,
        files: filesRes.data ?? [],
        result: resultRes.data ?? null,
        timeline: timelineRes.data ?? [],
      },
    });
  } catch (err) {
    logEvent('referral_detail_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}
