import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorizeClinicRequest, roleDenied, DATA_ROLES } from '@/lib/services/clinicAuthorization';
import { appendClarificationNote, isReferralTerminal, REFERRAL_NOTES_MAX } from '@/lib/services/referralWorkflow';
import { notifyReferral } from '@/lib/notifications/referralNotifier';
import { logEvent } from '@/lib/server/logging';

/**
 * REFERRAL CLARIFICATION — «طلب استكمال» (B20, reverse leg).
 *
 * The referring clinic asks the activity side (imaging center / lab) for more
 * information about a referral it SENT.
 *
 * Why a NOTE and not a status change: `imaging_requests.status` is owned by the
 * workflow of the ACTIVITY tenant (lib/services/workflowService enforces it),
 * and a referrer must never drive a partner's workflow. So the request is
 * appended to the shared notes thread (dated + marked) and the activity side is
 * notified — the center then answers through its own state machine
 * (accepted / needs_clarification / rejected).
 *
 * Access: ONLY the referring organization of THIS row. The activity side has
 * its own answer path, and an unrelated tenant gets 403.
 */
export const runtime = 'nodejs';

const schema = z.object({
  clinic_id: z.string().uuid(),
  note: z.string().min(1).max(800),
});

export async function POST(req: Request, { params }: { params: { requestId: string } }) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'اكتب نص طلب الاستكمال', details: parsed.error.errors }, { status: 400 });
    }
    const { clinic_id: clinicId, note } = parsed.data;

    const auth = await authorizeClinicRequest(req, clinicId);
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
    const gate = roleDenied(auth, DATA_ROLES);
    if (gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: request } = await supabaseAdmin
      .from('imaging_requests')
      .select('id, clinic_id, referring_clinic_id, patient_ref, requested_service, notes, status')
      .eq('id', params.requestId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!request) return NextResponse.json({ error: 'التحويل غير موجود' }, { status: 404 });
    if (request.referring_clinic_id !== clinicId) {
      return NextResponse.json({ error: 'طلب الاستكمال متاح للعيادة المحيلة فقط' }, { status: 403 });
    }
    if (isReferralTerminal(request.status)) {
      return NextResponse.json({ error: 'لا يمكن طلب استكمال لتحويل منتهٍ' }, { status: 409 });
    }

    const nextNotes = appendClarificationNote(request.notes, note, new Date());
    if (nextNotes.length > REFERRAL_NOTES_MAX) {
      return NextResponse.json({ error: 'ملاحظات التحويل بلغت الحد الأقصى' }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('imaging_requests')
      .update({ notes: nextNotes })
      .eq('id', request.id)
      .eq('referring_clinic_id', clinicId)
      .is('deleted_at', null)
      .select('id, notes, status')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) return NextResponse.json({ error: 'تعذر تحديث التحويل' }, { status: 409 });

    logEvent('referral_clarification_requested', {
      referral_id: request.id,
      referring_clinic_id: clinicId,
      imaging_center_id: request.clinic_id,
    });

    const { data: mine } = await supabaseAdmin.from('clinics').select('name').eq('id', clinicId).maybeSingle();
    await notifyReferral({
      recipientClinicId: request.clinic_id,
      requestId: request.id,
      event: 'referral_needs_clarification',
      patientRef: request.patient_ref,
      counterpartName: mine?.name ?? null,
      serviceName: request.requested_service,
      note,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    logEvent('referral_clarification_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ غير متوقع' }, { status: 500 });
  }
}
