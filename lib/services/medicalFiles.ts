/**
 * MEDICAL FILES — PRIVATE patient medical files. Never the public bucket.
 *
 * Binaries live in Supabase Storage bucket `medical-files` (public=false →
 * zero anonymous access), keys are random UUIDs under
 * medical/{patient_clinic_id}/{patient_id}/{uuid}.{ext}, and retrieval is
 * exclusively via authenticated short-lived signed URLs. Postgres holds
 * metadata only. DICOM-ready metadata columns live in the migration.
 */
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

export const MEDICAL_BUCKET = 'medical-files';
export type MedicalFileType = 'image' | 'video' | 'pdf' | 'document' | 'medical_report' | 'medical_image';
export type MedicalFileCategory = 'panorama' | 'cbct' | 'dicom' | 'report' | 'other';
export type MedicalFilesCursor = { created_at: string; id: string };

export function parseMedicalFilesPage(url: URL): { limit: number; cursor: MedicalFilesCursor | null } | null {
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? 200 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return null;

  const createdAt = url.searchParams.get('cursor_created_at');
  const id = url.searchParams.get('cursor_id');
  if (createdAt === null && id === null) return { limit, cursor: null };
  if (!createdAt || !id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(createdAt) ||
    !Number.isFinite(Date.parse(createdAt))
  ) {
    return null;
  }
  return { limit, cursor: { created_at: createdAt, id } };
}

export function buildMedicalFilesPage<T extends { id: string; created_at: string | null }>(
  rows: T[],
  limit: number,
): { data: T[]; has_more: boolean; next_cursor: MedicalFilesCursor | null } {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  return {
    data,
    has_more: hasMore,
    next_cursor: hasMore && last?.created_at ? { created_at: last.created_at, id: last.id } : null,
  };
}

const MIME_MAP: Record<string, { type: MedicalFileType; ext: string }> = {
  'image/jpeg': { type: 'image', ext: '.jpg' },
  'image/png': { type: 'image', ext: '.png' },
  'image/webp': { type: 'image', ext: '.webp' },
  'image/gif': { type: 'image', ext: '.gif' },
  'application/pdf': { type: 'pdf', ext: '.pdf' },
  'video/mp4': { type: 'video', ext: '.mp4' },
  'video/webm': { type: 'video', ext: '.webm' },
  'video/quicktime': { type: 'video', ext: '.mov' },
  'application/dicom': { type: 'medical_image', ext: '.dcm' },
  'application/octet-stream': { type: 'document', ext: '.bin' },
};
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.mp4', '.webm', '.mov', '.dcm'];

/** Per-type byte limits (medical files need large allowances for radiology).
 *  Configurable server-side; environment overrides may lower, but not exceed,
 *  the per-type policy below.
 *  There is deliberately NO small hardcoded ceiling in the UI — the server
 *  authoritative limits below are the real gate. */
const DEFAULT_MEDICAL_SIZE_LIMITS: Record<MedicalFileType, number> = {
  image: 50 * 1024 * 1024, // 50 MiB
  video: 1024 * 1024 * 1024, // 1 GiB (clinical video)
  pdf: 50 * 1024 * 1024, // 50 MiB (reports/archives)
  document: 50 * 1024 * 1024,
  medical_report: 50 * 1024 * 1024,
  medical_image: 2 * 1024 * 1024 * 1024, // 2 GiB (CBCT/CT/DICOM studies)
};

function resolveLimit(type: MedicalFileType): number {
  const overrides: Record<MedicalFileType, string | undefined> = {
    image: process.env.MEDICAL_MAX_IMAGE_BYTES,
    video: process.env.MEDICAL_MAX_VIDEO_BYTES,
    pdf: process.env.MEDICAL_MAX_PDF_BYTES,
    document: process.env.MEDICAL_MAX_DOCUMENT_BYTES,
    medical_report: process.env.MEDICAL_MAX_MEDICAL_REPORT_BYTES,
    medical_image: process.env.MEDICAL_MAX_MEDICAL_IMAGE_BYTES,
  };
  const v = overrides[type];
  if (v && Number.isFinite(Number(v)) && Number(v) > 0) {
    return Math.min(Number(v), DEFAULT_MEDICAL_SIZE_LIMITS[type]);
  }
  return DEFAULT_MEDICAL_SIZE_LIMITS[type];
}

export function getMedicalSizeLimit(type: MedicalFileType): number {
  return resolveLimit(type);
}

export function getAllMedicalSizeLimits(): Record<MedicalFileType, number> {
  const out = {} as Record<MedicalFileType, number>;
  for (const k of Object.keys(DEFAULT_MEDICAL_SIZE_LIMITS) as MedicalFileType[]) {
    out[k] = resolveLimit(k);
  }
  return out;
}

export type MedicalFileInput = { name: string; type: string; size: number };

export type MedicalFileMeta = {
  id: string;
  clinic_id: string;
  patient_id: string;
  imaging_request_id: string | null;
  appointment_id: string | null;
  file_type: MedicalFileType;
  medical_category: MedicalFileCategory;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  original_filename: string | null;
  uploaded_by: string | null;
  created_at: string | null;
};

/**
 * Minimal file-signature (magic bytes) detection for the common medical and
 * document types. The first up-to-16 bytes are hex-encoded by the client and
 * checked server-side as a second gate on top of MIME/extension (the MIME and
 * extension are never trusted alone). Unknown-but-allowed types (e.g. generic
 * DICOM without a fixed prefix or octet-stream) return `true` (no false block).
 */
export const MAGIC_SIGNATURES: Record<string, ReadonlyArray<{ hex: string; label: string }>> = {
  'image/jpeg': [{ hex: 'ffd8ff', label: 'JPEG' }],
  'image/png': [{ hex: '89504e470d0a1a0a', label: 'PNG' }],
  'image/webp': [{ hex: '52494646', label: 'RIFF/WEBP' }],
  'image/gif': [{ hex: '47494638', label: 'GIF' }],
  'application/pdf': [{ hex: '25504446', label: 'PDF' }],
  'video/mp4': [{ hex: '0000001866747970', label: 'MP4' }],
  'application/dicom': [{ hex: '4449434d', label: 'DICM' }],
};

/** Checks `magicHex` (up to 32 hex chars) against known signatures for a MIME.
 *  Returns true when it matches OR when there is no signature defined (no false
 *  blocking of legitimately-unknown-but-allowed medical types). */
export function magicBytesMatch(mimeType: string, magicHex: string | null | undefined): boolean {
  if (!magicHex) return true; // absent magic is not a blocker (client may not send it)
  const expected = MAGIC_SIGNATURES[mimeType];
  if (!expected || expected.length === 0) return true;
  const hex = magicHex.toLowerCase().replace(/^0x/, '');
  return expected.some((sig) => hex.startsWith(sig.hex));
}

export function validateMedicalFile(
  file: MedicalFileInput
): { ok: true; type: MedicalFileType; ext: string; maxBytes: number } | { ok: false; message: string } {
  const entry = MIME_MAP[file.type];
  if (!entry) {
    return { ok: false, message: 'نوع الملف غير مدعوم في الملفات الطبية. المقبول: JPG / PNG / WebP / GIF / PDF / MP4 / WebM / MOV / DICOM' };
  }
  if (file.size <= 0) return { ok: false, message: 'الملف فارغ' };
  const maxBytes = getMedicalSizeLimit(entry.type);
  if (file.size > maxBytes) {
    return { ok: false, message: `حجم الملف يتجاوز الحد المسموح لهذا النوع (${Math.round(maxBytes / 1024 / 1024)}MB)` };
  }
  const lower = file.name.toLowerCase().trim();
  if (!ALLOWED_EXTS.some((e) => lower.endsWith(e))) {
    return { ok: false, message: 'امتداد الملف غير مدعوم' };
  }
  return { ok: true, type: entry.type, ext: entry.ext, maxBytes };
}

/** Tenant-isolated storage path; the original filename is NEVER the key. */
export function buildMedicalFileStoragePath(patientClinicId: string, patientId: string, ext: string): string {
  return `medical/${patientClinicId}/${patientId}/${randomUUID()}${ext}`;
}

/** Short-lived authenticated signed URL (never a public URL). */
export async function signMedicalFileUrl(
  storagePath: string,
  seconds = 900,
  transform?: { width: number; height: number; resize: 'contain' | 'cover' | 'fill' },
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(MEDICAL_BUCKET)
    .createSignedUrl(storagePath, seconds, transform ? { transform } : undefined);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'تعذر إنشاء رابط مؤقت للملف');
  return data.signedUrl;
}

export async function uploadMedicalFile(input: {
  clinicId: string;
  patientClinicId: string;
  patientId: string;
  imagingRequestId: string | null;
  appointmentId: string | null;
  file: File;
  uploadedBy: string | null;
}): Promise<{ ok: true; item: MedicalFileMeta } | { ok: false; message: string }> {
  const validation = validateMedicalFile(input.file);
  if ('message' in validation) return validation;

  const path = buildMedicalFileStoragePath(input.patientClinicId, input.patientId, validation.ext);
  const { error: upError } = await supabaseAdmin.storage
    .from(MEDICAL_BUCKET)
    .upload(path, input.file, { cacheControl: '3600', contentType: input.file.type, upsert: false });
  if (upError) return { ok: false, message: `تعذر رفع الملف إلى التخزين: ${upError.message}` };

  const { data, error } = await supabaseAdmin
    .from('medical_files')
    .insert({
      clinic_id: input.clinicId,
      patient_id: input.patientId,
      imaging_request_id: input.imagingRequestId,
      appointment_id: input.appointmentId,
      file_type: validation.type,
      mime_type: input.file.type,
      size_bytes: input.file.size,
      storage_path: path,
      original_filename: input.file.name,
      uploaded_by: input.uploadedBy,
    })
    .select('*')
    .single();
  if (error) {
    // Roll back the orphan object — no dangling storage.
    await supabaseAdmin.storage.from(MEDICAL_BUCKET).remove([path]);
    return { ok: false, message: `تعذر حفظ بيانات الملف: ${error.message}` };
  }
  return { ok: true, item: data as MedicalFileMeta };
}

export async function deleteMedicalFileById(
  clinicId: string,
  fileId: string
): Promise<{ ok: boolean; message?: string }> {
  const { data: row, error: readError } = await supabaseAdmin
    .from('medical_files')
    .select('storage_path, clinic_id')
    .eq('id', fileId)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError) return { ok: false, message: readError.message };
  if (!row) return { ok: false, message: 'الملف غير موجود' };
  if (row.clinic_id !== clinicId) return { ok: false, message: 'لا تملك صلاحية على هذا الملف' };

  const { error: delError } = await supabaseAdmin
    .from('medical_files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', fileId)
    .eq('clinic_id', clinicId);
  if (delError) return { ok: false, message: delError.message };
  await supabaseAdmin.storage.from(MEDICAL_BUCKET).remove([row.storage_path]);
  return { ok: true };
}
// ----------------------------------------------------------------------------
// DIRECT-TO-OBJECT-STORAGE SIGNED UPLOAD (large-file / radiology friendly).
// The Next.js API never buffers the whole binary: it only produces a short-
// lived presigned PUT URL (createSignedUploadUrl); the browser/device streams
// the object straight to Supabase Storage. `confirm` then verifies the object
// landed and writes metadata (with orphan cleanup on failure).
// ----------------------------------------------------------------------------

export type MedicalUploadIntentInput = {
  clinicId: string;
  patientClinicId: string;
  patientId: string;
  clientUploadId?: string | null;
  imagingRequestId: string | null;
  appointmentId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  magicHex?: string | null;
  uploadedBy: string | null;
  fileTypeOverride?: MedicalFileType | null;
  medicalCategory?: MedicalFileCategory | null;
};

export type MedicalUploadIntent =
  | {
      ok: true;
      storagePath: string;
      uploadUrl: string;
      token: string;
      resumableEndpoint: string;
      clientUploadId: string;
      uploadRequired: boolean;
      alreadyConfirmed: boolean;
      confirmedFileId: string | null;
      fileType: MedicalFileType;
      medicalCategory: MedicalFileCategory;
      maxBytes: number;
    }
  | { ok: false; message: string };

export async function createMedicalUploadIntent(input: MedicalUploadIntentInput): Promise<MedicalUploadIntent> {
  const validation = validateMedicalFile({ name: input.filename, type: input.mimeType, size: input.sizeBytes });
  if ('message' in validation) return validation;

  const allowedOverrides = new Set<MedicalFileType>(['image', 'video', 'pdf', 'document', 'medical_report', 'medical_image']);
  const resolvedType = input.fileTypeOverride && allowedOverrides.has(input.fileTypeOverride) ? input.fileTypeOverride : validation.type;

  // Server-side magic-bytes gate: rejects a spoofed MIME/extension when a known
  // signature exists for that type, WITHOUT buffering the whole file.
  if (!magicBytesMatch(input.mimeType, input.magicHex)) {
    return { ok: false, message: 'توقيع الملف غير مطابق لنوعه المعلن (فشل التحقق من المحتوى)' };
  }

  const clientUploadId = input.clientUploadId ?? randomUUID();
  const { data: existingSession, error: existingSessionError } = await supabaseAdmin
    .from('medical_upload_sessions')
    .select('id, clinic_id, patient_id, imaging_request_id, storage_path, mime_type, size_bytes, file_type, medical_category, original_filename, status, expires_at, created_by')
    .eq('clinic_id', input.clinicId)
    .eq('client_upload_id', clientUploadId)
    .maybeSingle();
  if (existingSessionError) {
    return { ok: false, message: `تعذر التحقق من جلسة الرفع السابقة: ${existingSessionError.message}` };
  }

  if (existingSession) {
    const matchesRequest = (existingSession.imaging_request_id ?? null) === input.imagingRequestId;
    if (
      existingSession.patient_id !== input.patientId ||
      !matchesRequest ||
      existingSession.created_by !== input.uploadedBy ||
      existingSession.mime_type !== input.mimeType ||
      Number(existingSession.size_bytes) !== input.sizeBytes ||
      existingSession.original_filename !== input.filename
    ) {
      return { ok: false, message: 'معرّف الرفع مرتبط بملف أو مستخدم مختلف' };
    }

    if (existingSession.status === 'confirmed') {
      const { data: confirmedFile, error: confirmedFileError } = await supabaseAdmin
        .from('medical_files')
        .select('id')
        .eq('clinic_id', input.clinicId)
        .eq('storage_path', existingSession.storage_path)
        .is('deleted_at', null)
        .maybeSingle();
      if (confirmedFileError) {
        return { ok: false, message: `تعذر التحقق من اكتمال الرفع: ${confirmedFileError.message}` };
      }
      if (confirmedFile) {
        return {
          ok: true,
          storagePath: existingSession.storage_path,
          uploadUrl: '',
          token: '',
          resumableEndpoint: getMedicalResumableUploadEndpoint(),
          clientUploadId,
          uploadRequired: false,
          alreadyConfirmed: true,
          confirmedFileId: confirmedFile.id,
          fileType: existingSession.file_type as MedicalFileType,
          medicalCategory: existingSession.medical_category as MedicalFileCategory,
          maxBytes: validation.maxBytes,
        };
      }
      return { ok: false, message: 'جلسة الرفع مؤكدة لكن سجل الملف غير موجود؛ أعد المحاولة بعد تحديث الصفحة' };
    }

    if (existingSession.status !== 'started' || (existingSession.expires_at && new Date(existingSession.expires_at).getTime() <= Date.now())) {
      return { ok: false, message: 'انتهت صلاحية جلسة الرفع. أعد اختيار الملف لبدء رفع جديد' };
    }
  }

  const path = existingSession?.storage_path ?? buildMedicalFileStoragePath(input.patientClinicId, input.patientId, validation.ext);

  if (existingSession) {
    const parent = path.slice(0, path.lastIndexOf('/'));
    const objectName = path.slice(path.lastIndexOf('/') + 1);
    const { data: listed, error: listError } = await supabaseAdmin.storage.from(MEDICAL_BUCKET).list(parent, { search: objectName });
    if (listError) {
      return { ok: false, message: `تعذر استعادة جلسة الرفع: ${listError.message}` };
    }
    if ((listed ?? []).some((object) => object.name === objectName)) {
      return {
        ok: true,
        storagePath: path,
        uploadUrl: '',
        token: '',
        resumableEndpoint: getMedicalResumableUploadEndpoint(),
        clientUploadId,
        uploadRequired: false,
        alreadyConfirmed: false,
        confirmedFileId: null,
        fileType: existingSession.file_type as MedicalFileType,
        medicalCategory: existingSession.medical_category as MedicalFileCategory,
        maxBytes: validation.maxBytes,
      };
    }
  }

  const { data, error } = await supabaseAdmin.storage
    .from(MEDICAL_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.signedUrl || !data?.token) {
    return { ok: false, message: `تعذر فتح قناة رفع مباشرة: ${error?.message ?? 'unknown'}` };
  }

  const session = {
    clinic_id: input.clinicId,
    patient_id: input.patientId,
    client_upload_id: clientUploadId,
    imaging_request_id: input.imagingRequestId,
    storage_path: path,
    token: data.token,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    file_type: resolvedType,
    medical_category: input.medicalCategory ?? 'other',
    original_filename: input.filename,
    status: 'started' as const,
    created_by: input.uploadedBy,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
  const { error: sessionWriteError } = await supabaseAdmin
    .from('medical_upload_sessions')
    .upsert(session, { onConflict: 'clinic_id,storage_path' });
  if (sessionWriteError) {
    const isDuplicate =
      sessionWriteError.code === '23505' ||
      sessionWriteError.message?.includes('uq_medical_upload_session_path');
    if (!isDuplicate) {
      return { ok: false, message: `تعذر حفظ جلسة الرفع: ${sessionWriteError.message}` };
    }

    const { error: reuseError } = await supabaseAdmin
      .from('medical_upload_sessions')
      .update(session)
      .eq('clinic_id', input.clinicId)
      .eq('storage_path', path);
    if (reuseError) {
      return { ok: false, message: `تعذر إعادة استخدام جلسة الرفع: ${reuseError.message}` };
    }
  }

  return {
    ok: true,
    storagePath: path,
    uploadUrl: data.signedUrl,
    token: data.token,
    resumableEndpoint: getMedicalResumableUploadEndpoint(),
    clientUploadId,
    uploadRequired: true,
    alreadyConfirmed: false,
    confirmedFileId: null,
    fileType: resolvedType,
    medicalCategory: input.medicalCategory ?? 'other',
    maxBytes: validation.maxBytes,
  };
}

function getMedicalResumableUploadEndpoint(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');

  const url = new URL(configuredUrl);
  if (url.hostname.endsWith('.supabase.co') && !url.hostname.endsWith('.storage.supabase.co')) {
    url.hostname = url.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co');
  }
  url.pathname = '/storage/v1/upload/resumable';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export type MedicalUploadConfirmInput = {
  clinicId: string;
  patientClinicId: string;
  patientId: string;
  imagingRequestId: string | null;
  appointmentId: string | null;
  storagePath: string;
  token: string | null;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  fileType: MedicalFileType;
  medicalCategory?: MedicalFileCategory | null;
  uploadedBy: string | null;
  magicHex?: string | null;
};

export async function confirmMedicalUpload(
  input: MedicalUploadConfirmInput
): Promise<{ ok: true; item: MedicalFileMeta } | { ok: false; message: string }> {
  // 1) Validate against policy (MIME/extension/size/magic).
  const validation = validateMedicalFile({
    name: input.originalFilename,
    type: input.mimeType,
    size: input.sizeBytes,
  });
  if ('message' in validation) return validation;
  const allowedOverrides = new Set<MedicalFileType>(['image', 'video', 'pdf', 'document', 'medical_report', 'medical_image']);
  const resolvedType = allowedOverrides.has(input.fileType) ? input.fileType : validation.type;
  if (!magicBytesMatch(input.mimeType, input.magicHex)) {
    return { ok: false, message: 'توقيع الملف غير مطابق لنوعه المعلن' };
  }

  // 2) Confirm the object actually exists in storage (never trust the client
  //    claimed the upload happened).
  const parent = input.storagePath.slice(0, input.storagePath.lastIndexOf('/'));
  const objectName = input.storagePath.slice(input.storagePath.lastIndexOf('/') + 1);
  const { data: listed } = await supabaseAdmin.storage.from(MEDICAL_BUCKET).list(parent, { search: objectName });
  const object = (listed ?? []).find((o) => o.name === objectName);
  if (!object) {
    return { ok: false, message: 'لم يُعثر على الملف في التخزين بعد الرفع — أعد المحاولة' };
  }
  if (object.metadata?.size && Number(object.metadata.size) !== input.sizeBytes) {
    return { ok: false, message: 'حجم الملف في التخزين لا يطابق الحجم المعلن' };
  }

  // 3) Write the metadata row (authoritative).
  const { data: existingFile, error: existingFileError } = await supabaseAdmin
    .from('medical_files')
    .select('*')
    .eq('clinic_id', input.clinicId)
    .eq('storage_path', input.storagePath)
    .maybeSingle();
  if (existingFileError) {
    return { ok: false, message: `تعذر التحقق من بيانات الملف السابقة: ${existingFileError.message}` };
  }
  if (existingFile) {
    const matchesExisting =
      existingFile.patient_id === input.patientId &&
      (existingFile.imaging_request_id ?? null) === input.imagingRequestId &&
      existingFile.mime_type === input.mimeType &&
      Number(existingFile.size_bytes) === input.sizeBytes &&
      existingFile.original_filename === input.originalFilename;
    if (!matchesExisting) {
      return { ok: false, message: 'مسار التخزين مرتبط بسجل ملف مختلف؛ لم يتم حذف أي ملف' };
    }
    const { error: finalizeError } = await supabaseAdmin
      .from('medical_upload_sessions')
      .update({ status: 'confirmed', finalized_at: new Date().toISOString() })
      .eq('storage_path', input.storagePath)
      .eq('clinic_id', input.clinicId);
    if (finalizeError) {
      logEvent('medical_files_upload_session_finalize_failed', { clinic_id: input.clinicId, error: finalizeError.message }, 'error');
    }
    return { ok: true, item: existingFile as MedicalFileMeta };
  }

  const { data, error } = await supabaseAdmin
    .from('medical_files')
    .insert({
      clinic_id: input.clinicId,
      patient_id: input.patientId,
      imaging_request_id: input.imagingRequestId,
      appointment_id: input.appointmentId,
      file_type: resolvedType,
      medical_category: input.medicalCategory ?? 'other',
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      storage_path: input.storagePath,
      original_filename: input.originalFilename,
      uploaded_by: input.uploadedBy,
    })
    .select('*')
    .single();
  if (error) {
    // A network failure may happen after the metadata insert committed. Never
    // delete the binary until a follow-up read proves there is no saved row.
    const { data: committedFile, error: committedFileError } = await supabaseAdmin
      .from('medical_files')
      .select('*')
      .eq('clinic_id', input.clinicId)
      .eq('storage_path', input.storagePath)
      .maybeSingle();
    if (committedFileError) {
      return { ok: false, message: `تعذر تأكيد حفظ بيانات الملف بعد خطأ قاعدة البيانات: ${error.message}` };
    }
    if (committedFile) return { ok: true, item: committedFile as MedicalFileMeta };

    const { error: removeError } = await supabaseAdmin.storage.from(MEDICAL_BUCKET).remove([input.storagePath]);
    await supabaseAdmin
      .from('medical_upload_sessions')
      .update({ status: 'orphan', finalized_at: new Date().toISOString() })
      .eq('storage_path', input.storagePath);
    if (removeError) {
      return { ok: false, message: `تعذر حفظ بيانات الملف (${error.message}) وتعذر تنظيف الملف المؤقت (${removeError.message})` };
    }
    return { ok: false, message: `تعذر حفظ بيانات الملف: ${error.message}` };
  }

  const { error: finalizeError } = await supabaseAdmin
    .from('medical_upload_sessions')
    .update({ status: 'confirmed', finalized_at: new Date().toISOString() })
    .eq('storage_path', input.storagePath)
    .eq('clinic_id', input.clinicId);
  if (finalizeError) {
    logEvent('medical_files_upload_session_finalize_failed', { clinic_id: input.clinicId, error: finalizeError.message }, 'error');
  }
  return { ok: true, item: data as MedicalFileMeta };
}
// ----------------------------------------------------------------------------
// SHARED ORGANIZATION-LEVEL ACCESS CHECK (cross-tenant safe).
// Owner clinic  → own patient files.
// Imaging/partner org → ONLY when an imaging request connects THIS org with
// the patient's org (relationship + specific patient + specific request).
// ----------------------------------------------------------------------------
export type MedicalFileOrgAccess =
  | { ok: true; patient: { id: string; clinic_id: string } }
  | { ok: false; message: string };

export async function resolveMedicalFileOrgAccess(
  clinicId: string,
  patientId: string,
  imagingRequestId: string | null
): Promise<MedicalFileOrgAccess> {
  const { data: patient } = await supabaseAdmin
    .from('patients')
    .select('id, clinic_id')
    .eq('id', patientId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!patient) return { ok: false, message: 'المريض غير موجود' };

  if (imagingRequestId) {
    const { data: req } = await supabaseAdmin
      .from('imaging_requests')
      .select('id, clinic_id, referring_clinic_id, patient_id')
      .eq('id', imagingRequestId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!req) return { ok: false, message: 'طلب التصوير غير موجود' };
    if (req.patient_id !== patientId) return { ok: false, message: 'الطلب لا يخص هذا المريض' };
    if (req.clinic_id !== clinicId && req.referring_clinic_id !== clinicId) {
      return { ok: false, message: 'لا تملك صلاحية على هذا الطلب' };
    }
    return { ok: true, patient };
  }

  if (patient.clinic_id !== clinicId) {
    return { ok: false, message: 'لا تملك صلاحية على ملفات هذا المريض' };
  }
  return { ok: true, patient };
}
