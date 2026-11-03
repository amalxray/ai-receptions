import { NextResponse } from 'next/server';
import { authorizeClinicRequest, DATA_ROLES, roleDenied } from '@/lib/services/clinicAuthorization';
import { getSupabaseEnvConfig } from '@/lib/config';
import { rateLimit } from '@/lib/rateLimit';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REQUEST_BYTES = 1_000_000;
const MAX_ANNOTATIONS = 500;
const MAX_CLASS_NAME_LENGTH = 100;
const SIGNED_IMAGE_PATH_PREFIX = '/storage/v1/object/sign/medical-files/';

type Annotation = {
  tool: 'rectangle' | 'circle' | 'arrow';
  x: number;
  y: number;
  width: number;
  height: number;
  flipX: boolean;
  flipY: boolean;
  className: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isAnnotation(value: unknown): value is Annotation {
  if (!isRecord(value)) return false;
  return (
    (value.tool === 'rectangle' || value.tool === 'circle' || value.tool === 'arrow') &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    value.x >= 0 &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y) &&
    value.y >= 0 &&
    typeof value.width === 'number' &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    typeof value.height === 'number' &&
    Number.isFinite(value.height) &&
    value.height > 0 &&
    typeof value.flipX === 'boolean' &&
    typeof value.flipY === 'boolean' &&
    typeof value.className === 'string' &&
    value.className.trim().length > 0 &&
    value.className.length <= MAX_CLASS_NAME_LENGTH
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return errorResponse('حجم بيانات التعديلات يتجاوز الحد المسموح.', 413);
  }

  const config = getSupabaseEnvConfig();
  if (!config.isConfigured) {
    return errorResponse('خدمة قاعدة البيانات غير مهيأة.', 503);
  }

  let payload: unknown;
  let body: string;
  try {
    body = await request.text();
  } catch {
    return errorResponse('تعذر قراءة بيانات التعديلات.', 400);
  }
  if (body.length > MAX_REQUEST_BYTES) {
    return errorResponse('حجم بيانات التعديلات يتجاوز الحد المسموح.', 413);
  }
  try {
    payload = JSON.parse(body);
  } catch {
    return errorResponse('صيغة البيانات غير صالحة.', 400);
  }

  if (!isRecord(payload)) return errorResponse('صيغة البيانات غير صالحة.', 400);

  const { clinic_id: clinicId, patient_id: patientId, medical_file_id: medicalFileId } = payload;
  if (
    typeof clinicId !== 'string' ||
    !clinicId.trim() ||
    typeof patientId !== 'string' ||
    !patientId.trim() ||
    typeof medicalFileId !== 'string' ||
    !medicalFileId.trim()
  ) {
    return errorResponse('clinic_id وpatient_id وmedical_file_id مطلوبة.', 400);
  }
  if (
    typeof payload.image_width !== 'number' ||
    !Number.isInteger(payload.image_width) ||
    payload.image_width <= 0 ||
    typeof payload.image_height !== 'number' ||
    !Number.isInteger(payload.image_height) ||
    payload.image_height <= 0
  ) {
    return errorResponse('أبعاد صورة الأشعة غير صالحة.', 400);
  }
  if (!Array.isArray(payload.annotations) || payload.annotations.length > MAX_ANNOTATIONS) {
    return errorResponse('قائمة التعديلات غير صالحة.', 400);
  }
  for (const annotation of payload.annotations) {
    if (!isAnnotation(annotation)) {
      return errorResponse('قائمة التعديلات غير صالحة.', 400);
    }
    if (
      annotation.x + annotation.width > payload.image_width ||
      annotation.y + annotation.height > payload.image_height
    ) {
      return errorResponse('يوجد تعديل خارج حدود الصورة.', 400);
    }
  }

  if (typeof payload.image_url !== 'string' || payload.image_url.length > 4096) {
    return errorResponse('رابط صورة الأشعة غير صالح.', 400);
  }

  const authorization = await authorizeClinicRequest(request, clinicId);
  if (!authorization.authorized) {
    return errorResponse(
      authorization.status === 401 ? 'Unauthorized' : 'Forbidden',
      authorization.status,
    );
  }
  const denied = roleDenied(authorization, DATA_ROLES);
  if (denied) return errorResponse('Forbidden', 403);

  const rate = rateLimit(`panorama-annotations:${authorization.user.id}`, 30, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'تم تجاوز حد الطلبات. حاول مجدداً لاحقاً.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const { data: medicalFile, error: fileError } = await supabaseAdmin
    .from('medical_files')
    .select('id, clinic_id, patient_id, storage_path, medical_category, deleted_at')
    .eq('id', medicalFileId)
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .is('deleted_at', null)
    .maybeSingle();
  if (fileError) {
    console.error('[panorama-annotations] medical file lookup failed:', fileError.message);
    return errorResponse('تعذر التحقق من ملف الأشعة.', 500);
  }
  if (!medicalFile) return errorResponse('ملف الأشعة غير موجود ضمن هذا المريض.', 404);
  if (medicalFile.medical_category !== 'panorama') {
    return errorResponse('الملف ليس مصنفاً كصورة بانوراما.', 400);
  }

  let imageUrl: URL;
  let storagePath: string;
  try {
    imageUrl = new URL(payload.image_url);
    storagePath = decodeURIComponent(imageUrl.pathname.slice(SIGNED_IMAGE_PATH_PREFIX.length));
  } catch {
    return errorResponse('رابط صورة الأشعة غير صالح.', 400);
  }
  let configuredOrigin: string;
  try {
    configuredOrigin = new URL(config.supabaseUrl).origin;
  } catch {
    return errorResponse('خدمة قاعدة البيانات غير مهيأة.', 503);
  }
  if (
    imageUrl.origin !== configuredOrigin ||
    !imageUrl.pathname.startsWith(SIGNED_IMAGE_PATH_PREFIX) ||
    storagePath !== medicalFile.storage_path
  ) {
    return errorResponse('رابط الصورة لا يطابق ملف الأشعة المحدد.', 400);
  }

  const { data: savedAnnotations, error: insertError } = await supabaseAdmin
    .from('ai_training_annotations')
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      medical_file_id: medicalFileId,
      image_url: `${imageUrl.origin}${imageUrl.pathname}`,
      image_width: payload.image_width,
      image_height: payload.image_height,
      annotations: payload.annotations,
      created_by: authorization.user.id,
    })
    .select('id, created_at')
    .single();

  if (insertError || !savedAnnotations) {
    console.error(
      '[panorama-annotations] save failed:',
      insertError?.code,
      insertError?.message ?? 'Database returned no row',
    );
    if (insertError?.code === 'PGRST205' || insertError?.code === '42P01') {
      return errorResponse(
        'جدول التعديلات غير مهيأ. يلزم تطبيق migration 20261102_ai_training_annotations.sql.',
        500,
      );
    }
    return errorResponse('تعذر حفظ تعديلات صورة الأشعة.', 500);
  }

  return NextResponse.json({ data: savedAnnotations }, { status: 201 });
}
