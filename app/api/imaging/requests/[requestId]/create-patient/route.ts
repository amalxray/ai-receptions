import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorizeClinicRequest, roleDenied, DATA_ROLES } from '@/lib/services/clinicAuthorization';
import { findOrCreatePatient } from '@/lib/services/bookingService';
import { logEvent } from '@/lib/server/logging';

/**
 * ONE-CLICK PATIENT FILE FROM AN IMAGING REQUEST (Phase 7.4).
 *
 * POST /api/imaging/requests/:requestId/create-patient
 *
 * The imaging center turns an incoming referral into a patient file of its
 * own: `findOrCreatePatient` matches an existing center patient by phone (or
 * email) first and only creates a new record when no match exists, then the
 * imaging_request is linked to that patient (patient_id).
 *
 * Cross-tenant privacy: the referring clinic never shares the patient's
 * phone, so linking works only when the center supplies it (optional body
 * field) or when the request itself carries one in the future.
 */
export const runtime = 'nodejs';

const bodySchema = z.object({
  clinic_id: z.string().uuid(), // the imaging center (owner of the request)
  phone: z
    .string()
    .trim()
    .max(32)
    .optional()
    .nullable()
    .transform((v) => (v ? v.replace(/[\s-]/g, '') : null)),
});

export async function POST(req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  try {
    const { requestId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'بيانات غير صحيحة', details: parsed.error.errors }, { status: 400 });
    }
    const centerId = parsed.data.clinic_id;
    const phone = parsed.data.phone && parsed.data.phone.length >= 7 ? parsed.data.phone : null;

    const auth = await authorizeClinicRequest(req, centerId);
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
    const gate = roleDenied(auth, DATA_ROLES);
    if (gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // The request must be owned by the caller's clinic (the imaging center).
    const { data: request } = await supabaseAdmin
      .from('imaging_requests')
      .select('id, clinic_id, patient_id, patient_ref, status')
      .eq('id', requestId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!request) return NextResponse.json({ error: 'طلب التصوير غير موجود' }, { status: 404 });
    if (request.clinic_id !== centerId) {
      return NextResponse.json({ error: 'طلب التصوير لا يتبع مركزك' }, { status: 403 });
    }
    if (request.patient_id) {
      return NextResponse.json({ error: 'الطلب مرتبط بملف مريض مسبقاً' }, { status: 409 });
    }

    const name = request.patient_ref?.trim() || 'مريض من تحويل تصوير';
    const patientId = await findOrCreatePatient({
      clinicId: centerId,
      name,
      phone,
      email: null,
    });
    if (!patientId) return NextResponse.json({ error: 'تعذر إنشاء ملف المريض' }, { status: 500 });

    const { error: linkError } = await supabaseAdmin
      .from('imaging_requests')
      .update({ patient_id: patientId })
      .eq('id', requestId)
      .is('deleted_at', null);
    if (linkError) throw new Error(linkError.message);

    logEvent('imaging_request_patient_created', {
      imaging_center_id: centerId,
      request_id: requestId,
      patient_id: patientId,
      matched_by_phone: Boolean(phone),
    });
    return NextResponse.json({ data: { patient_id: patientId, linked: true } }, { status: 201 });
  } catch (err) {
    logEvent('imaging_request_patient_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}
