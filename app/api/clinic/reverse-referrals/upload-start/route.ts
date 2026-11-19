import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createMedicalUploadIntent, validateMedicalFile } from '@/lib/services/medicalFiles';
import { authorizeReverseReferral } from '@/lib/services/reverseReferrals';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';

const schema = z.object({
  target_clinic_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  client_upload_id: z.string().uuid(),
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
      return NextResponse.json({ error: 'بيانات رفع التحويل غير صحيحة' }, { status: 400 });
    }

    const input = parsed.data;
    const access = await authorizeReverseReferral(req, fromClinicId, input.target_clinic_id);
    if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id, clinic_id')
      .eq('id', input.patient_id)
      .eq('clinic_id', fromClinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (patientError) throw new Error(patientError.message);
    if (!patient) return NextResponse.json({ error: 'ملف مريض مركز التصوير غير موجود' }, { status: 404 });

    if (!input.mime_type.startsWith('image/') && input.mime_type !== 'application/dicom') {
      return NextResponse.json({ error: 'يمكن تحويل الصور الطبية فقط' }, { status: 400 });
    }
    const validation = validateMedicalFile({
      name: input.filename,
      type: input.mime_type,
      size: input.size_bytes,
    });
    if ('message' in validation) return NextResponse.json({ error: validation.message }, { status: 400 });

    const intent = await createMedicalUploadIntent({
      clinicId: fromClinicId,
      patientClinicId: fromClinicId,
      patientId: input.patient_id,
      clientUploadId: input.client_upload_id,
      imagingRequestId: null,
      appointmentId: null,
      filename: input.filename,
      mimeType: input.mime_type,
      sizeBytes: input.size_bytes,
      magicHex: input.magic ?? null,
      uploadedBy: access.auth.user.id,
      fileTypeOverride: validation.type,
      medicalCategory: input.mime_type === 'application/dicom' ? 'dicom' : 'other',
    });
    if (!intent.ok || 'message' in intent) {
      return NextResponse.json({ error: 'message' in intent ? intent.message : 'تعذر تجهيز رفع الملف' }, { status: 400 });
    }

    return NextResponse.json({
      data: {
        storage_path: intent.storagePath,
        upload_url: intent.uploadUrl,
        token: intent.token,
        resumable_endpoint: intent.resumableEndpoint,
        client_upload_id: intent.clientUploadId,
        upload_required: intent.uploadRequired,
        already_confirmed: intent.alreadyConfirmed,
        confirmed_file_id: intent.confirmedFileId,
        file_type: intent.fileType,
        max_bytes: intent.maxBytes,
      },
    });
  } catch (error) {
    logEvent('reverse_referral_upload_start_error', { error: error instanceof Error ? error.message : String(error) }, 'error');
    return NextResponse.json({ error: 'تعذر تجهيز رفع الملف' }, { status: 500 });
  }
}
