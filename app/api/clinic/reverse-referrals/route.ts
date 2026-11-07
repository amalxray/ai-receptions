import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  buildMedicalFileStoragePath,
  magicBytesMatch,
  MEDICAL_BUCKET,
  signMedicalFileUrl,
  validateMedicalFile,
} from '@/lib/services/medicalFiles';
import { authorizeClinicRequest, DATA_ROLES, roleDenied } from '@/lib/services/clinicAuthorization';
import { authorizeReverseReferral } from '@/lib/services/reverseReferrals';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CreatedFile = { id: string; storage_path: string };
class ReverseReferralRequestError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

async function removeCreatedFile(file: CreatedFile) {
  const { error: rowError } = await supabaseAdmin
    .from('medical_files')
    .delete()
    .eq('id', file.id);
  const { error: storageError } = await supabaseAdmin.storage.from(MEDICAL_BUCKET).remove([file.storage_path]);
  if (rowError || storageError) {
    logEvent('reverse_referral_file_cleanup_error', {
      file_id: file.id,
      row_error: rowError?.message ?? null,
      storage_error: storageError?.message ?? null,
    }, 'error');
  }
}

async function createRecipientFile(input: {
  clinicId: string;
  patientId: string;
  fileId?: string;
  sourceClinicId: string;
  sourcePatientId: string;
  file?: File;
  uploadedBy: string;
}): Promise<{ file: CreatedFile; metadata: { file_type: string; mime_type: string; size_bytes: number; original_filename: string; medical_category: string } }> {
  let source: {
    file_type: string;
    mime_type: string;
    size_bytes: number;
    storage_path: string;
    original_filename: string | null;
    medical_category: string;
  };
  let copyFromPath: string | null = null;
  let uploadFile: File | null = null;

  if (input.fileId) {
    const { data, error } = await supabaseAdmin
      .from('medical_files')
      .select('id, clinic_id, patient_id, file_type, mime_type, size_bytes, storage_path, original_filename, medical_category')
      .eq('id', input.fileId)
      .eq('clinic_id', input.sourceClinicId)
      .eq('patient_id', input.sourcePatientId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new ReverseReferralRequestError('ملف الصورة غير موجود في ملف مريض مركز التصوير', 404);
    if (!data.storage_path.startsWith(`medical/${input.sourceClinicId}/${input.sourcePatientId}/`)) {
      throw new ReverseReferralRequestError('مسار ملف الصورة غير صالح');
    }
    if (!data.mime_type.startsWith('image/') && data.mime_type !== 'application/dicom') {
      throw new ReverseReferralRequestError('يمكن تحويل الصور الطبية فقط');
    }
    const validation = validateMedicalFile({
      name: data.storage_path.split('/').pop() || data.original_filename || '',
      type: data.mime_type,
      size: Number(data.size_bytes),
    });
    if ('message' in validation) throw new ReverseReferralRequestError(validation.message);
    source = {
      file_type: data.file_type,
      mime_type: data.mime_type,
      size_bytes: Number(data.size_bytes),
      storage_path: data.storage_path,
      original_filename: data.original_filename,
      medical_category: data.medical_category ?? 'other',
    };
    copyFromPath = source.storage_path;
  } else if (input.file) {
    const validation = validateMedicalFile(input.file);
    if ('message' in validation) throw new ReverseReferralRequestError(validation.message);
    if (!input.file.type.startsWith('image/') && input.file.type !== 'application/dicom') {
      throw new ReverseReferralRequestError('يمكن تحويل الصور الطبية فقط');
    }
    const bytes = new Uint8Array(await input.file.slice(0, 16).arrayBuffer());
    const magic = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (!magicBytesMatch(input.file.type, magic)) throw new ReverseReferralRequestError('محتوى الملف لا يطابق نوع الصورة');
    source = {
      file_type: validation.type,
      mime_type: input.file.type,
      size_bytes: input.file.size,
      storage_path: '',
      original_filename: input.file.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255),
      medical_category: input.file.type === 'application/dicom' ? 'dicom' : 'other',
    };
    uploadFile = input.file;
  } else {
    throw new ReverseReferralRequestError('اختر صورة من ملفات المريض أو ارفع صورة من الجهاز');
  }

  const fileValidation = validateMedicalFile({
    name: source.storage_path.split('/').pop() || source.original_filename || 'image.jpg',
    type: source.mime_type,
    size: source.size_bytes,
  });
  if ('message' in fileValidation) throw new ReverseReferralRequestError(fileValidation.message);
  const destinationPath = buildMedicalFileStoragePath(input.clinicId, input.patientId, fileValidation.ext);

  if (copyFromPath) {
    const { error } = await supabaseAdmin.storage.from(MEDICAL_BUCKET).copy(copyFromPath, destinationPath);
    if (error) throw new Error(error.message);
  } else if (uploadFile) {
    const { error } = await supabaseAdmin.storage.from(MEDICAL_BUCKET).upload(destinationPath, uploadFile, {
      cacheControl: '3600',
      contentType: source.mime_type,
      upsert: false,
    });
    if (error) throw new Error(error.message);
  }

  const { data: saved, error: insertError } = await supabaseAdmin
    .from('medical_files')
    .insert({
      clinic_id: input.clinicId,
      patient_id: input.patientId,
      imaging_request_id: null,
      appointment_id: null,
      file_type: source.file_type,
      medical_category: source.medical_category,
      mime_type: source.mime_type,
      size_bytes: source.size_bytes,
      storage_path: destinationPath,
      original_filename: source.original_filename,
      uploaded_by: input.uploadedBy,
    })
    .select('id, storage_path')
    .single();
  if (insertError) {
    const { error: cleanupError } = await supabaseAdmin.storage.from(MEDICAL_BUCKET).remove([destinationPath]);
    if (cleanupError) {
      logEvent('reverse_referral_upload_cleanup_error', { error: cleanupError.message }, 'error');
    }
    throw new Error(insertError.message);
  }

  return {
    file: saved,
    metadata: {
      file_type: source.file_type,
      mime_type: source.mime_type,
      size_bytes: source.size_bytes,
      original_filename: source.original_filename ?? 'صورة طبية',
      medical_category: source.medical_category,
    },
  };
}

export async function POST(req: Request) {
  let createdFile: CreatedFile | null = null;
  try {
    const url = new URL(req.url);
    const fromClinicId = url.searchParams.get('clinic_id') ?? '';
    if (!uuidPattern.test(fromClinicId)) return NextResponse.json({ error: 'clinic_id غير صحيح' }, { status: 400 });

    const form = await req.formData();
    const toClinicId = String(form.get('target_clinic_id') ?? '');
    const sourcePatientId = String(form.get('source_patient_id') ?? '');
    const patientIdTo = String(form.get('patient_id_to') ?? '');
    const fileId = String(form.get('file_id') ?? '');
    const fileValue = form.get('file');
    const uploadedFile = fileValue && typeof fileValue !== 'string' ? fileValue : undefined;
    const notes = String(form.get('notes') ?? '').trim();
    if (
      !uuidPattern.test(toClinicId) ||
      !uuidPattern.test(sourcePatientId) ||
      !uuidPattern.test(patientIdTo) ||
      (fileId && !uuidPattern.test(fileId)) ||
      (Boolean(fileId) === Boolean(uploadedFile)) ||
      notes.length > 2000
    ) {
      return NextResponse.json({ error: 'بيانات التحويل غير صحيحة' }, { status: 400 });
    }

    const access = await authorizeReverseReferral(req, fromClinicId, toClinicId);
    if (!access.ok) return NextResponse.json({ error: 'Forbidden' }, { status: access.status });

    const { data: sourcePatient, error: sourcePatientError } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('id', sourcePatientId)
      .eq('clinic_id', fromClinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (sourcePatientError) throw new Error(sourcePatientError.message);
    if (!sourcePatient) return NextResponse.json({ error: 'ملف مريض مركز التصوير غير موجود' }, { status: 404 });

    const { data: targetPatient, error: targetPatientError } = await supabaseAdmin
      .from('patients')
      .select('id, clinic_id, full_name, phone_number')
      .eq('id', patientIdTo)
      .eq('clinic_id', toClinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (targetPatientError) throw new Error(targetPatientError.message);
    if (!targetPatient) return NextResponse.json({ error: 'المريض غير موجود في العيادة المستهدفة' }, { status: 404 });

    const { data: sourceClinic, error: sourceClinicError } = await supabaseAdmin
      .from('clinics')
      .select('name')
      .eq('id', fromClinicId)
      .maybeSingle();
    if (sourceClinicError) throw new Error(sourceClinicError.message);

    const created = await createRecipientFile({
      clinicId: toClinicId,
      patientId: patientIdTo,
      fileId: fileId || undefined,
      sourceClinicId: fromClinicId,
      sourcePatientId,
      file: uploadedFile,
      uploadedBy: access.auth.user.id,
    });
    createdFile = created.file;
    const signedImageUrl = await signMedicalFileUrl(created.file.storage_path);

    const { data: referral, error: referralError } = await supabaseAdmin
      .from('reverse_referrals')
      .insert({
        from_clinic_id: fromClinicId,
        to_clinic_id: toClinicId,
        patient_id_to: patientIdTo,
        patient_name: targetPatient.full_name,
        patient_phone: targetPatient.phone_number,
        medical_file_id: created.file.id,
        image_url: created.file.storage_path,
        notes: notes || null,
        status: 'pending',
      })
      .select('id, from_clinic_id, to_clinic_id, patient_id_to, patient_name, patient_phone, medical_file_id, image_url, notes, status, created_at, accepted_at')
      .single();
    if (referralError) throw new Error(referralError.message);

    logEvent('reverse_referral_created', {
      reverse_referral_id: referral.id,
      from_clinic_id: fromClinicId,
      to_clinic_id: toClinicId,
      patient_id: patientIdTo,
      medical_file_id: created.file.id,
    });
    return NextResponse.json({
      data: {
        ...referral,
        from_clinic_name: sourceClinic?.name ?? null,
        image_url: signedImageUrl,
        file: created.metadata,
      },
    }, { status: 201 });
  } catch (error) {
    if (createdFile) await removeCreatedFile(createdFile);
    logEvent('reverse_referral_create_error', { error: error instanceof Error ? error.message : String(error) }, 'error');
    if (error instanceof ReverseReferralRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'تعذر إنشاء التحويل العكسي' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const clinicId = new URL(req.url).searchParams.get('clinic_id') ?? '';
    if (!uuidPattern.test(clinicId)) return NextResponse.json({ error: 'clinic_id غير صحيح' }, { status: 400 });

    const auth = await authorizeClinicRequest(req, clinicId);
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
    const gate = roleDenied(auth, DATA_ROLES);
    if (gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data, error } = await supabaseAdmin
      .from('reverse_referrals')
      .select('id, from_clinic_id, to_clinic_id, patient_id_to, patient_name, patient_phone, medical_file_id, image_url, notes, status, created_at, accepted_at')
      .eq('to_clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const senderIds = Array.from(new Set((data ?? []).map((row) => row.from_clinic_id)));
    const { data: clinics, error: clinicsError } = senderIds.length
      ? await supabaseAdmin.from('clinics').select('id, name').in('id', senderIds)
      : { data: [], error: null };
    if (clinicsError) throw new Error(clinicsError.message);
    const names = new Map((clinics ?? []).map((clinic) => [clinic.id, clinic.name]));
    const rows = await Promise.all((data ?? []).map(async (row) => ({
      ...row,
      from_clinic_name: names.get(row.from_clinic_id) ?? null,
      image_url: await signMedicalFileUrl(row.image_url),
    })));

    return NextResponse.json({ data: rows });
  } catch (error) {
    logEvent('reverse_referral_list_error', { error: error instanceof Error ? error.message : String(error) }, 'error');
    return NextResponse.json({ error: 'تعذر تحميل التحويلات الواردة' }, { status: 500 });
  }
}

const statusSchema = z.object({ clinic_id: z.string().uuid(), status: z.enum(['accepted', 'rejected']) });

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = statusSchema.safeParse(body);
    const referralId = new URL(req.url).searchParams.get('id') ?? '';
    if (!parsed.success || !uuidPattern.test(referralId)) {
      return NextResponse.json({ error: 'بيانات التحديث غير صحيحة' }, { status: 400 });
    }

    const { clinic_id: clinicId, status } = parsed.data;
    const auth = await authorizeClinicRequest(req, clinicId);
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
    const gate = roleDenied(auth, DATA_ROLES);
    if (gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: current, error: currentError } = await supabaseAdmin
      .from('reverse_referrals')
      .select('id, to_clinic_id, status')
      .eq('id', referralId)
      .eq('to_clinic_id', clinicId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) return NextResponse.json({ error: 'التحويل غير موجود' }, { status: 404 });
    if (current.status !== 'pending') return NextResponse.json({ error: 'تمت معالجة هذا التحويل مسبقًا' }, { status: 409 });

    const { data, error } = await supabaseAdmin
      .from('reverse_referrals')
      .update({ status, accepted_at: status === 'accepted' ? new Date().toISOString() : null })
      .eq('id', referralId)
      .eq('to_clinic_id', clinicId)
      .eq('status', 'pending')
      .select('id, status, accepted_at')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'تمت معالجة هذا التحويل مسبقًا' }, { status: 409 });
    return NextResponse.json({ data });
  } catch (error) {
    logEvent('reverse_referral_status_update_error', { error: error instanceof Error ? error.message : String(error) }, 'error');
    return NextResponse.json({ error: 'تعذر تحديث حالة التحويل' }, { status: 500 });
  }
}
