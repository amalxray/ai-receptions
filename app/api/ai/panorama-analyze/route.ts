import { NextResponse } from 'next/server';
import { fileTypeFromBuffer } from 'file-type';
import { authorizeClinicRequest, DATA_ROLES, roleDenied } from '@/lib/services/clinicAuthorization';
import { getSupabaseEnvConfig } from '@/lib/config';
import { rateLimit } from '@/lib/rateLimit';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPanoramaInferenceConfig } from '@/lib/ai/panoramaInferenceConfig';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CONSENT_VERSION = '2026-10-11-v1';

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  return NextResponse.json(
    { enabled: getPanoramaInferenceConfig() !== null },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: Request) {
  const inferenceConfig = getPanoramaInferenceConfig();
  if (!inferenceConfig) {
    return errorResponse('ميزة تحليل صور البانوراما غير مفعلة.', 404);
  }

  const config = getSupabaseEnvConfig();
  if (!config.isConfigured) {
    return errorResponse('خدمة قاعدة البيانات غير مهيأة.', 503);
  }

  try {
    const formData = await request.formData();
    const clinicId = formData.get('clinic_id');
    const patientId = formData.get('patient_id');
    const medicalFileId = formData.get('medical_file_id');
    const consent = formData.get('consent');

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
    if (consent !== 'true') {
      return errorResponse('يجب تأكيد الموافقة على تحليل الصورة أولاً.', 400);
    }

    const authorization = await authorizeClinicRequest(request, clinicId);
    if (!authorization.authorized) {
      return errorResponse(
        authorization.status === 401 ? 'Unauthorized' : 'Forbidden',
        authorization.status
      );
    }
    const denied = roleDenied(authorization, DATA_ROLES);
    if (denied) return errorResponse('Forbidden', 403);

    const rate = rateLimit(`panorama-analysis:${authorization.user.id}`, 10, 60_000);
    if (!rate.ok) {
      return NextResponse.json(
        { error: 'تم تجاوز حد الطلبات. حاول مجدداً لاحقاً.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      );
    }

    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('id', patientId)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (patientError) {
      console.error('[panorama-analyze] patient lookup failed:', patientError.message);
      return errorResponse('تعذر التحقق من المريض.', 500);
    }
    if (!patient) return errorResponse('المريض غير موجود ضمن هذه العيادة.', 404);

    const { data: medicalFile, error: fileError } = await supabaseAdmin
      .from('medical_files')
      .select('id, clinic_id, patient_id, storage_path, mime_type, size_bytes, medical_category, deleted_at')
      .eq('id', medicalFileId)
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .maybeSingle();
    if (fileError) {
      console.error('[panorama-analyze] medical file lookup failed:', fileError.message);
      return errorResponse('تعذر التحقق من ملف الأشعة.', 500);
    }
    if (!medicalFile) return errorResponse('ملف الأشعة غير موجود ضمن هذا المريض.', 404);
    if (medicalFile.medical_category !== 'panorama') {
      return errorResponse('الملف ليس مصنفاً كصورة بانوراما.', 400);
    }
    const storedSize = Number(medicalFile.size_bytes);
    if (!Number.isFinite(storedSize) || storedSize > MAX_IMAGE_BYTES) {
      return errorResponse('حجم الصورة يتجاوز الحد المسموح.', 413);
    }

    const { data: imageBlob, error: downloadError } = await supabaseAdmin.storage
      .from('medical-files')
      .download(medicalFile.storage_path);
    if (downloadError || !imageBlob) {
      console.error(
        '[panorama-analyze] private image download failed:',
        downloadError?.message ?? 'Storage returned no image'
      );
      return errorResponse('تعذر قراءة صورة الأشعة.', 502);
    }
    if (imageBlob.size > MAX_IMAGE_BYTES) {
      return errorResponse('حجم الصورة يتجاوز الحد المسموح.', 413);
    }

    const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());
    const detectedType = await fileTypeFromBuffer(imageBuffer);
    if (!detectedType || !ALLOWED_IMAGE_TYPES.has(detectedType.mime)) {
      return errorResponse('صيغة صورة الأشعة غير مدعومة.', 415);
    }

    const oracleForm = new FormData();
    oracleForm.append(
      'image',
      imageBlob.slice(0, imageBlob.size, detectedType.mime),
      `panorama.${detectedType.ext}`
    );

    let inferenceResponse: Response;
    try {
      inferenceResponse = await fetch(inferenceConfig.endpoint, {
        method: 'POST',
        headers: { 'X-API-Key': inferenceConfig.apiKey },
        body: oracleForm,
        signal: AbortSignal.timeout(55_000),
      });
    } catch (error) {
      console.error(
        '[panorama-analyze] Oracle request failed:',
        error instanceof Error ? error.name : 'UnknownError'
      );
      return errorResponse('خدمة تحليل الصور غير متاحة حالياً.', 502);
    }

    if (!inferenceResponse.ok) {
      console.error('[panorama-analyze] Oracle returned status:', inferenceResponse.status);
      return errorResponse(
        inferenceResponse.status === 429
          ? 'خدمة التحليل مشغولة؛ حاول مجدداً لاحقاً.'
          : 'تعذر تحليل الصورة حالياً.',
        inferenceResponse.status === 429 ? 429 : 502
      );
    }

    let inferenceResult: unknown;
    try {
      inferenceResult = await inferenceResponse.json();
    } catch {
      console.error('[panorama-analyze] Oracle returned invalid JSON.');
      return errorResponse('استجابة خدمة التحليل غير صالحة.', 502);
    }
    if (
      typeof inferenceResult !== 'object' ||
      inferenceResult === null ||
      !('predictions' in inferenceResult) ||
      !Array.isArray(inferenceResult.predictions) ||
      !('model_version' in inferenceResult) ||
      typeof inferenceResult.model_version !== 'string' ||
      !inferenceResult.model_version ||
      !('image_width' in inferenceResult) ||
      typeof inferenceResult.image_width !== 'number' ||
      !Number.isInteger(inferenceResult.image_width) ||
      inferenceResult.image_width <= 0 ||
      !('image_height' in inferenceResult) ||
      typeof inferenceResult.image_height !== 'number' ||
      !Number.isInteger(inferenceResult.image_height) ||
      inferenceResult.image_height <= 0
    ) {
      console.error('[panorama-analyze] Oracle response did not match the inference contract.');
      return errorResponse('استجابة خدمة التحليل غير صالحة.', 502);
    }

    const { data: analysis, error: insertError } = await supabaseAdmin
      .from('medical_image_analyses')
      .insert({
        clinic_id: clinicId,
        patient_id: patientId,
        medical_file_id: medicalFileId,
        model_version: inferenceResult.model_version,
        image_width: inferenceResult.image_width,
        image_height: inferenceResult.image_height,
        predictions: inferenceResult.predictions,
        consent_version: CONSENT_VERSION,
        consent_confirmed_at: new Date().toISOString(),
        created_by: authorization.user.id,
      })
      .select('id, model_version, image_width, image_height, predictions, created_at')
      .single();

    if (insertError || !analysis) {
      console.error(
        '[panorama-analyze] analysis persistence failed:',
        insertError?.code,
        insertError?.message ?? 'Database returned no row'
      );
      if (insertError?.code === 'PGRST205' || insertError?.code === '42P01') {
        return errorResponse(
          'جدول نتائج تحليل البانوراما غير مهيأ في قاعدة البيانات. يلزم تطبيق migration 20261011_medical_image_analyses.sql.',
          500
        );
      }
      if (insertError?.code === '42501') {
        return errorResponse('لا تملك قاعدة البيانات صلاحية حفظ نتيجة التحليل.', 500);
      }
      return errorResponse(
        insertError?.code
          ? `تعذر حفظ نتيجة التحليل (رمز الخطأ: ${insertError.code}).`
          : 'تعذر حفظ نتيجة التحليل.',
        500
      );
    }

    return NextResponse.json({ data: analysis }, { status: 201 });
  } catch (error) {
    console.error(
      '[panorama-analyze] request failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return errorResponse('حدث خطأ أثناء تحليل صورة الأشعة.', 500);
  }
}
