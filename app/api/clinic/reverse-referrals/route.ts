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
import { normalizeArabic } from '@/lib/services/patientSearch';
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
  const { error: rowError } = await supabaseAdmin.from('medical_files').delete().eq('id', file.id);
  const { error: storageError } = await supabaseAdmin.storage.from(MEDICAL_BUCKET).remove([file.storage_path]);
  if (rowError || storageError) {
    logEvent('reverse_referral_file_cleanup_error', {
      file_id: file.id,
      row_error: rowError?.message ?? null,
      storage_error: storageError?.message ?? null,
    }, 'error');
  }
}

async function storeSourceFile(input: {
  clinicId: string;
  patientId: string;
  fileId?: string;
  file?: File;
  uploadedBy: string;
}): Promise<{ file: CreatedFile; created: boolean }> {
  if (input.fileId) {
    const { data, error } = await supabaseAdmin
      .from('medical_files')
      .select('id, storage_path, mime_type, size_bytes')
      .eq('id', input.fileId)
      .eq('clinic_id', input.clinicId)
      .eq('patient_id', input.patientId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || !data.storage_path.startsWith(`medical/${input.clinicId}/${input.patientId}/`)) {
      throw new ReverseReferralRequestError('ملف الصورة غير موجود في ملف مريض مركز التصوير', 404);
    }
    if (!data.mime_type.startsWith('image/') && data.mime_type !== 'application/dicom') {
      throw new ReverseReferralRequestError('يمكن تحويل الصور الطبية فقط');
    }
    const validation = validateMedicalFile({
      name: data.storage_path.split('/').pop() || '',
      type: data.mime_type,
      size: Number(data.size_bytes),
    });
    if ('message' in validation) throw new ReverseReferralRequestError(validation.message);
    return { file: { id: data.id, storage_path: data.storage_path }, created: false };
  }

  if (!input.file) throw new ReverseReferralRequestError('اختر صورة من ملفات المريض أو ارفع صورة من الجهاز');
  const validation = validateMedicalFile(input.file);
  if ('message' in validation) throw new ReverseReferralRequestError(validation.message);
  if (!input.file.type.startsWith('image/') && input.file.type !== 'application/dicom') {
    throw new ReverseReferralRequestError('يمكن تحويل الصور الطبية فقط');
  }
  const bytes = new Uint8Array(await input.file.slice(0, 16).arrayBuffer());
  const magic = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (!magicBytesMatch(input.file.type, magic)) {
    throw new ReverseReferralRequestError('محتوى الملف لا يطابق نوع الصورة');
  }

  const storagePath = buildMedicalFileStoragePath(input.clinicId, input.patientId, validation.ext);
  const { error: uploadError } = await supabaseAdmin.storage.from(MEDICAL_BUCKET).upload(storagePath, input.file, {
    cacheControl: '3600',
    contentType: input.file.type,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabaseAdmin
    .from('medical_files')
    .insert({
      clinic_id: input.clinicId,
      patient_id: input.patientId,
      imaging_request_id: null,
      appointment_id: null,
      file_type: validation.type,
      medical_category: input.file.type === 'application/dicom' ? 'dicom' : 'other',
      mime_type: input.file.type,
      size_bytes: input.file.size,
      storage_path: storagePath,
      original_filename: input.file.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255),
      uploaded_by: input.uploadedBy,
    })
    .select('id, storage_path')
    .single();
  if (error) {
    const { error: cleanupError } = await supabaseAdmin.storage.from(MEDICAL_BUCKET).remove([storagePath]);
    if (cleanupError) logEvent('reverse_referral_upload_cleanup_error', { error: cleanupError.message }, 'error');
    throw new Error(error.message);
  }
  return { file: data, created: true };
}

export async function POST(req: Request) {
  let createdFile: CreatedFile | null = null;
  try {
    const fromClinicId = new URL(req.url).searchParams.get('clinic_id') ?? '';
    if (!uuidPattern.test(fromClinicId)) return NextResponse.json({ error: 'بيانات التحويل غير صحيحة' }, { status: 400 });

    const form = await req.formData();
    const toClinicId = String(form.get('target_clinic_id') ?? '');
    const sourcePatientId = String(form.get('source_patient_id') ?? '');
    const patientName = String(form.get('from_patient_name') ?? '').trim();
    const patientPhone = String(form.get('from_patient_phone') ?? '').trim();
    const fileId = String(form.get('file_id') ?? '');
    const fileValue = form.get('file');
    const uploadedFile = fileValue && typeof fileValue !== 'string' ? fileValue : undefined;
    const notes = String(form.get('notes') ?? '').trim();

    if (
      !uuidPattern.test(toClinicId) ||
      !uuidPattern.test(sourcePatientId) ||
      (fileId && !uuidPattern.test(fileId)) ||
      Boolean(fileId) === Boolean(uploadedFile) ||
      patientName.length < 2 ||
      patientName.length > 200 ||
      canonicalPhone(patientPhone).length < 5 ||
      patientPhone.length > 40 ||
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

    const sourceFileResult = await storeSourceFile({
      clinicId: fromClinicId,
      patientId: sourcePatientId,
      fileId: fileId || undefined,
      file: uploadedFile,
      uploadedBy: access.auth.user.id,
    });
    if (sourceFileResult.created) createdFile = sourceFileResult.file;

    const { data: referral, error } = await supabaseAdmin
      .from('reverse_referrals')
      .insert({
        from_clinic_id: fromClinicId,
        to_clinic_id: toClinicId,
        patient_id_to: null,
        from_patient_name: patientName,
        from_patient_phone: patientPhone,
        medical_file_id: sourceFileResult.file.id,
        image_url: sourceFileResult.file.storage_path,
        notes: notes || null,
        status: 'pending',
      })
      .select('id, status')
      .single();
    if (error) throw new Error(error.message);
    createdFile = null;

    logEvent('reverse_referral_created', {
      reverse_referral_id: referral.id,
      from_clinic_id: fromClinicId,
      to_clinic_id: toClinicId,
      medical_file_id: sourceFileResult.file.id,
    });
    return NextResponse.json({ data: { id: referral.id, status: referral.status } }, { status: 201 });
  } catch (error) {
    if (createdFile) await removeCreatedFile(createdFile);
    logEvent('reverse_referral_create_error', { error: error instanceof Error ? error.message : String(error) }, 'error');
    if (error instanceof ReverseReferralRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'تعذر إنشاء التحويل العكسي' }, { status: 500 });
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
      .select('id, from_clinic_id, to_clinic_id, patient_id_to, from_patient_name, from_patient_phone, medical_file_id, image_url, notes, status, created_at, accepted_at')
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

function canonicalPhone(value: string): string {
  const digits = normalizeArabic(value).replace(/\D/g, '');
  if (digits.startsWith('00970')) return `0${digits.slice(5)}`;
  if (digits.startsWith('970')) return `0${digits.slice(3)}`;
  return digits;
}

async function findOrCreatePatient(clinicId: string, name: string, phone: string): Promise<string> {
  const phoneDigits = canonicalPhone(phone);
  const suffix = phoneDigits.slice(-Math.min(phoneDigits.length, 7));
  const arabicDigits = suffix.replace(/\d/g, (digit) => String.fromCharCode(0x0660 + Number(digit)));
  const persianDigits = suffix.replace(/\d/g, (digit) => String.fromCharCode(0x06f0 + Number(digit)));
  const { data: phoneCandidates, error: phoneError } = await supabaseAdmin
    .from('patients')
    .select('id, full_name, phone_number')
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .or([
      `phone_number.ilike.%${suffix}%`,
      `phone_number.ilike.%${arabicDigits}%`,
      `phone_number.ilike.%${persianDigits}%`,
    ].join(','))
    .limit(100);
  if (phoneError) throw new Error(phoneError.message);

  const phoneMatches = (phoneCandidates ?? []).filter(
    (patient) => canonicalPhone(patient.phone_number ?? '') === phoneDigits,
  );
  if (phoneMatches.length === 1) return phoneMatches[0].id;
  if (phoneMatches.length > 1) {
    const nameMatches = phoneMatches.filter(
      (patient) => normalizeArabic(patient.full_name) === normalizeArabic(name),
    );
    if (nameMatches.length === 1) return nameMatches[0].id;
    throw new ReverseReferralRequestError('تعذر تحديد ملف مريض واحد مطابق؛ يرجى مراجعة بيانات التحويل', 409);
  }

  const nameMatches: Array<{ id: string; full_name: string }> = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data: nameCandidates, error: nameError } = await supabaseAdmin
      .from('patients')
      .select('id, full_name')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (nameError) throw new Error(nameError.message);
    nameMatches.push(
      ...(nameCandidates ?? []).filter(
        (patient) => normalizeArabic(patient.full_name) === normalizeArabic(name),
      ),
    );
    if ((nameCandidates ?? []).length < pageSize) break;
  }
  if (nameMatches.length === 1) return nameMatches[0].id;
  if (nameMatches.length > 1) {
    throw new ReverseReferralRequestError('تعذر تحديد ملف مريض واحد مطابق؛ يرجى مراجعة بيانات التحويل', 409);
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from('patients')
    .insert({
      clinic_id: clinicId,
      full_name: name,
      phone_number: phone,
      metadata: { source: 'تحويل من مركز تصوير', status: 'جديد' },
    })
    .select('id')
    .single();
  if (createError) throw new Error(createError.message);
  return created.id;
}

async function attachReferralFile(input: {
  clinicId: string;
  patientId: string;
  sourceClinicId: string;
  sourceFileId: string;
  uploadedBy: string;
}): Promise<CreatedFile> {
  const { data: source, error: sourceError } = await supabaseAdmin
    .from('medical_files')
    .select('id, clinic_id, patient_id, file_type, medical_category, mime_type, size_bytes, storage_path, original_filename')
    .eq('id', input.sourceFileId)
    .eq('clinic_id', input.sourceClinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (sourceError) throw new Error(sourceError.message);
  if (!source || !source.storage_path.startsWith(`medical/${input.sourceClinicId}/${source.patient_id}/`)) {
    throw new ReverseReferralRequestError('الصورة المرفقة غير متاحة', 404);
  }
  if (!source.mime_type.startsWith('image/') && source.mime_type !== 'application/dicom') {
    throw new ReverseReferralRequestError('الملف المرفق ليس صورة طبية');
  }
  const validation = validateMedicalFile({
    name: source.storage_path.split('/').pop() || source.original_filename || '',
    type: source.mime_type,
    size: Number(source.size_bytes),
  });
  if ('message' in validation) throw new ReverseReferralRequestError(validation.message);

  const destinationPath = buildMedicalFileStoragePath(input.clinicId, input.patientId, validation.ext);
  const { error: copyError } = await supabaseAdmin.storage.from(MEDICAL_BUCKET).copy(source.storage_path, destinationPath);
  if (copyError) throw new Error(copyError.message);

  const { data: saved, error: insertError } = await supabaseAdmin
    .from('medical_files')
    .insert({
      clinic_id: input.clinicId,
      patient_id: input.patientId,
      imaging_request_id: null,
      appointment_id: null,
      file_type: source.file_type,
      medical_category: source.medical_category ?? (source.mime_type === 'application/dicom' ? 'dicom' : 'other'),
      mime_type: source.mime_type,
      size_bytes: Number(source.size_bytes),
      storage_path: destinationPath,
      original_filename: source.original_filename,
      uploaded_by: input.uploadedBy,
    })
    .select('id, storage_path')
    .single();
  if (insertError) {
    const { error: cleanupError } = await supabaseAdmin.storage.from(MEDICAL_BUCKET).remove([destinationPath]);
    if (cleanupError) logEvent('reverse_referral_copy_cleanup_error', { error: cleanupError.message }, 'error');
    throw new Error(insertError.message);
  }
  return saved;
}

export async function PATCH(req: Request) {
  let claimAcquired = false;
  let createdFile: CreatedFile | null = null;
  let referralId = '';
  let clinicId = '';
  let claimTime = '';
  try {
    const body = await req.json().catch(() => null);
    const parsed = statusSchema.safeParse(body);
    referralId = new URL(req.url).searchParams.get('id') ?? '';
    if (!parsed.success || !uuidPattern.test(referralId)) {
      return NextResponse.json({ error: 'بيانات التحديث غير صحيحة' }, { status: 400 });
    }

    clinicId = parsed.data.clinic_id;
    const { status } = parsed.data;
    const auth = await authorizeClinicRequest(req, clinicId);
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
    const gate = roleDenied(auth, DATA_ROLES);
    if (gate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: current, error: currentError } = await supabaseAdmin
      .from('reverse_referrals')
      .select('id, from_clinic_id, to_clinic_id, patient_id_to, from_patient_name, from_patient_phone, medical_file_id, status, accepted_at')
      .eq('id', referralId)
      .eq('to_clinic_id', clinicId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) return NextResponse.json({ error: 'التحويل غير موجود' }, { status: 404 });
    if (current.status !== 'pending') return NextResponse.json({ error: 'تمت معالجة هذا التحويل مسبقًا' }, { status: 409 });

    if (status === 'rejected') {
      const { data: rejected, error } = await supabaseAdmin
        .from('reverse_referrals')
        .update({ status: 'rejected' })
        .eq('id', referralId)
        .eq('to_clinic_id', clinicId)
        .eq('status', 'pending')
        .is('accepted_at', null)
        .select('id, status, accepted_at')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!rejected) return NextResponse.json({ error: 'تمت معالجة هذا التحويل مسبقًا' }, { status: 409 });
      return NextResponse.json({ data: rejected });
    }

    if (!current.from_patient_name || !current.from_patient_phone) {
      return NextResponse.json({ error: 'بيانات المريض غير مكتملة في هذا التحويل' }, { status: 400 });
    }

    claimTime = new Date().toISOString();
    const { data: claim, error: claimError } = await supabaseAdmin
      .from('reverse_referrals')
      .update({ accepted_at: claimTime })
      .eq('id', referralId)
      .eq('to_clinic_id', clinicId)
      .eq('status', 'pending')
      .is('accepted_at', null)
      .select('id')
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claim) return NextResponse.json({ error: 'تمت معالجة هذا التحويل مسبقًا' }, { status: 409 });
    claimAcquired = true;

    const patientId = current.patient_id_to
      ?? await findOrCreatePatient(clinicId, current.from_patient_name, current.from_patient_phone);
    createdFile = await attachReferralFile({
      clinicId,
      patientId,
      sourceClinicId: current.from_clinic_id,
      sourceFileId: current.medical_file_id,
      uploadedBy: auth.user.id,
    });

    const acceptedAt = new Date().toISOString();
    const { data: accepted, error: acceptError } = await supabaseAdmin
      .from('reverse_referrals')
      .update({
        status: 'accepted',
        patient_id_to: patientId,
        medical_file_id: createdFile.id,
        image_url: createdFile.storage_path,
        accepted_at: acceptedAt,
      })
      .eq('id', referralId)
      .eq('to_clinic_id', clinicId)
      .eq('status', 'pending')
      .eq('accepted_at', claimTime)
      .select('id, status, accepted_at, patient_id_to')
      .maybeSingle();
    if (acceptError) throw new Error(acceptError.message);
    if (!accepted) throw new ReverseReferralRequestError('تمت معالجة هذا التحويل مسبقًا', 409);

    claimAcquired = false;
    createdFile = null;
    return NextResponse.json({ data: accepted });
  } catch (error) {
    if (createdFile) await removeCreatedFile(createdFile);
    if (claimAcquired) {
      const { error: releaseError } = await supabaseAdmin
        .from('reverse_referrals')
        .update({ accepted_at: null })
        .eq('id', referralId)
        .eq('to_clinic_id', clinicId)
        .eq('status', 'pending')
        .eq('accepted_at', claimTime);
      if (releaseError) {
        logEvent('reverse_referral_claim_release_error', { referral_id: referralId, error: releaseError.message }, 'error');
      }
    }
    logEvent('reverse_referral_status_update_error', {
      reverse_referral_id: referralId,
      error: error instanceof Error ? error.message : String(error),
    }, 'error');
    if (error instanceof ReverseReferralRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'تعذر تحديث حالة التحويل' }, { status: 500 });
  }
}
