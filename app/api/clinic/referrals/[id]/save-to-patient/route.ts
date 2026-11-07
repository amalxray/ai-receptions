import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ADMIN_ROLES, authorizeClinicRequest, roleDenied } from '@/lib/services/clinicAuthorization';
import { MEDICAL_BUCKET, validateMedicalFile } from '@/lib/services/medicalFiles';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';

const bodySchema = z.object({ file_id: z.string().uuid() });

type ReferralFileSource = {
  id: string;
  clinic_id: string;
  patient_id: string;
  imaging_request_id: string | null;
  file_type: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  original_filename: string | null;
};

async function findSavedFile(clinicId: string, storagePath: string) {
  return supabaseAdmin
    .from('medical_files')
    .select('id, clinic_id, patient_id, storage_path')
    .eq('clinic_id', clinicId)
    .eq('storage_path', storagePath)
    .is('deleted_at', null)
    .maybeSingle();
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id') ?? '';
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const auth = await authorizeClinicRequest(req, clinicId);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
    }
    const gate = roleDenied(auth, ADMIN_ROLES);
    if (gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'بيانات غير صحيحة' }, { status: 400 });

    const { data: request, error: requestError } = await supabaseAdmin
      .from('imaging_requests')
      .select('id, clinic_id, referring_clinic_id, patient_id, modality, requested_service')
      .eq('id', params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) return NextResponse.json({ error: 'التحويل غير موجود' }, { status: 404 });
    if (request.referring_clinic_id !== clinicId || !request.patient_id) {
      return NextResponse.json({ error: 'لا تملك صلاحية حفظ نتيجة هذا التحويل' }, { status: 403 });
    }

    const { data: result, error: resultError } = await supabaseAdmin
      .from('imaging_results')
      .select('id, imaging_request_id, imaging_center_id, referring_clinic_id, patient_id, status, images')
      .eq('imaging_request_id', request.id)
      .eq('imaging_center_id', request.clinic_id)
      .eq('referring_clinic_id', clinicId)
      .eq('patient_id', request.patient_id)
      .eq('status', 'finalized')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (resultError) throw new Error(resultError.message);
    const imageIds = Array.isArray(result?.images) ? result.images : [];
    if (!result || !imageIds.includes(parsed.data.file_id)) {
      return NextResponse.json({ error: 'الملف ليس صورة ضمن نتيجة هذا التحويل' }, { status: 404 });
    }

    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id, clinic_id')
      .eq('id', request.patient_id)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (patientError) throw new Error(patientError.message);
    if (!patient) return NextResponse.json({ error: 'ملف المريض غير موجود في العيادة المُحيلة' }, { status: 404 });

    const { data: source, error: sourceError } = await supabaseAdmin
      .from('medical_files')
      .select('id, clinic_id, patient_id, imaging_request_id, file_type, mime_type, size_bytes, storage_path, original_filename')
      .eq('id', parsed.data.file_id)
      .eq('clinic_id', request.clinic_id)
      .eq('patient_id', request.patient_id)
      .eq('imaging_request_id', request.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (sourceError) throw new Error(sourceError.message);
    if (!source) return NextResponse.json({ error: 'ملف النتيجة غير موجود' }, { status: 404 });

    const sourcePathPrefix = `medical/${patient.clinic_id}/${patient.id}/`;
    if (!source.storage_path.startsWith(sourcePathPrefix)) {
      logEvent('referral_save_file_invalid_source_path', { request_id: request.id, file_id: source.id }, 'error');
      return NextResponse.json({ error: 'مسار ملف النتيجة غير صالح' }, { status: 400 });
    }

    const validation = validateMedicalFile({
      name: source.storage_path.split('/').pop() ?? '',
      type: source.mime_type,
      size: source.size_bytes,
    });
    if ('message' in validation) {
      return NextResponse.json({ error: 'نوع ملف النتيجة غير مدعوم للحفظ' }, { status: 400 });
    }

    const destinationPath =
      `${sourcePathPrefix}referral-${request.id}-${source.id}${validation.ext}`;
    const { data: existing, error: existingError } = await findSavedFile(clinicId, destinationPath);
    if (existingError) throw new Error(existingError.message);
    if (existing) {
      return NextResponse.json({ data: existing, already_saved: true });
    }

    const { error: copyError } = await supabaseAdmin.storage
      .from(MEDICAL_BUCKET)
      .copy(source.storage_path, destinationPath);
    if (copyError) {
      const { data: racedCopy, error: raceLookupError } = await findSavedFile(clinicId, destinationPath);
      if (raceLookupError) throw new Error(raceLookupError.message);
      if (racedCopy) return NextResponse.json({ data: racedCopy, already_saved: true });
      throw new Error(copyError.message);
    }

    const modality = `${request.modality ?? ''} ${request.requested_service ?? ''}`.toLowerCase();
    const medicalCategory =
      source.mime_type === 'application/dicom' || source.file_type === 'medical_image'
        ? 'dicom'
        : source.mime_type === 'application/pdf' || source.file_type === 'pdf' || source.file_type === 'medical_report'
          ? 'report'
          : /cbct|cone.?beam|tomograph|ct\b/.test(modality)
            ? 'cbct'
            : 'panorama';

    const { data: saved, error: insertError } = await supabaseAdmin
      .from('medical_files')
      .insert({
        clinic_id: clinicId,
        patient_id: patient.id,
        imaging_request_id: null,
        appointment_id: null,
        file_type: source.file_type,
        medical_category: medicalCategory,
        mime_type: source.mime_type,
        size_bytes: source.size_bytes,
        storage_path: destinationPath,
        original_filename: source.original_filename,
        uploaded_by: auth.user?.id ?? null,
      })
      .select('id, clinic_id, patient_id, file_type, medical_category, mime_type, size_bytes, storage_path, original_filename, created_at')
      .single();

    if (insertError) {
      const { data: racedInsert, error: raceLookupError } = await findSavedFile(clinicId, destinationPath);
      if (raceLookupError) throw new Error(raceLookupError.message);
      if (racedInsert) return NextResponse.json({ data: racedInsert, already_saved: true });
      await supabaseAdmin.storage.from(MEDICAL_BUCKET).remove([destinationPath]);
      throw new Error(insertError.message);
    }

    logEvent('referral_result_saved_to_patient', {
      clinic_id: clinicId,
      patient_id: patient.id,
      request_id: request.id,
      source_file_id: source.id,
      saved_file_id: saved.id,
    });
    return NextResponse.json({ data: saved, already_saved: false }, { status: 201 });
  } catch (err) {
    logEvent('referral_save_to_patient_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'حدث خطأ أثناء حفظ الملف في ملف المريض' }, { status: 500 });
  }
}
