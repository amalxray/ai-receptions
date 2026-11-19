import { NextResponse } from 'next/server';
import { z } from 'zod';
import { confirmMedicalUpload } from '@/lib/services/medicalFiles';
import { authorizeReverseReferral } from '@/lib/services/reverseReferrals';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';

const schema = z.object({
  target_clinic_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  storage_path: z.string().min(1).max(512),
  filename: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(120),
  size_bytes: z.number().int().positive(),
  magic: z.string().max(64).nullable().optional(),
});
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    const fromClinicId = new URL(req.url).searchParams.get('clinic_id') ?? '';
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success || !uuidPattern.test(fromClinicId)) {
      return NextResponse.json({ error: 'بيانات تأكيد رفع التحويل غير صحيحة' }, { status: 400 });
    }

    const input = parsed.data;
    const access = await authorizeReverseReferral(req, fromClinicId, input.target_clinic_id);
    if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('medical_upload_sessions')
      .select('storage_path, patient_id, imaging_request_id, mime_type, size_bytes, file_type, medical_category, original_filename, created_by, expires_at, status')
      .eq('clinic_id', fromClinicId)
      .eq('storage_path', input.storage_path)
      .eq('created_by', access.auth.user.id)
      .eq('status', 'started')
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    if (
      !session ||
      session.patient_id !== input.patient_id ||
      session.imaging_request_id !== null ||
      session.mime_type !== input.mime_type ||
      Number(session.size_bytes) !== input.size_bytes ||
      session.original_filename !== input.filename ||
      (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) ||
      !input.storage_path.startsWith(`medical/${fromClinicId}/${input.patient_id}/`)
    ) {
      return NextResponse.json({ error: 'بيانات الملف لا تطابق جلسة الرفع المصرح بها' }, { status: 403 });
    }

    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id, clinic_id')
      .eq('id', input.patient_id)
      .eq('clinic_id', fromClinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (patientError) throw new Error(patientError.message);
    if (!patient) return NextResponse.json({ error: 'ملف مريض مركز التصوير غير موجود' }, { status: 404 });

    const result = await confirmMedicalUpload({
      clinicId: fromClinicId,
      patientClinicId: fromClinicId,
      patientId: input.patient_id,
      imagingRequestId: null,
      appointmentId: null,
      storagePath: input.storage_path,
      token: null,
      mimeType: input.mime_type,
      sizeBytes: input.size_bytes,
      originalFilename: input.filename,
      fileType: session.file_type,
      medicalCategory: session.medical_category,
      uploadedBy: access.auth.user.id,
      magicHex: input.magic ?? null,
    });
    if (!result.ok || 'message' in result) {
      return NextResponse.json({ error: 'message' in result ? result.message : 'فشل حفظ الملف' }, { status: 400 });
    }
    return NextResponse.json({ data: result.item }, { status: 201 });
  } catch (error) {
    logEvent('reverse_referral_upload_confirm_error', { error: error instanceof Error ? error.message : String(error) }, 'error');
    return NextResponse.json({ error: 'تعذر تأكيد رفع الملف' }, { status: 500 });
  }
}
