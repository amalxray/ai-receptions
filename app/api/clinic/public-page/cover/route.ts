import { NextResponse } from 'next/server';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { logEvent } from '@/lib/server/logging';
import { writeAuditLog } from '@/lib/services/auditService';
import { updatePublicPageConfig } from '@/lib/services/clinicPublicConfig';
import {
  buildMediaStoragePath,
  mediaPublicUrl,
  MEDIA_BUCKET,
  validateMediaFile,
} from '@/lib/services/clinicPublicMedia';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** POST /api/clinic/public-page/cover — upload and persist a tenant cover in one request. */
export async function POST(req: Request) {
  let storagePath: string | null = null;
  let clinicId: string | null = null;
  try {
    const url = new URL(req.url);
    clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized || roleDenied(authorization, ADMIN_ROLES)) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'الملف مطلوب (file)' }, { status: 400 });

    const validation = validateMediaFile({ name: file.name, type: file.type, size: file.size });
    if ('message' in validation) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }
    if (validation.mediaType !== 'image') {
      return NextResponse.json({ error: 'يُسمح برفع الصور فقط كغلاف' }, { status: 400 });
    }

    storagePath = buildMediaStoragePath(clinicId, validation.ext);
    const { error: uploadError } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      logEvent('public_page_cover_upload_error', { clinicId, error: uploadError.message }, 'error');
      return NextResponse.json({ error: `تعذر رفع صورة الغلاف إلى التخزين: ${uploadError.message}` }, { status: 500 });
    }

    const coverUrl = mediaPublicUrl(storagePath);
    const saveResult = await updatePublicPageConfig(clinicId, { cover_url: coverUrl });
    if (!saveResult.ok) throw new Error(saveResult.message ?? 'تعذر حفظ رابط الغلاف');

    await writeAuditLog({
      clinicId,
      actorUserId: authorization.user?.id ?? null,
      action: 'clinic.public_page.cover.update',
      resourceType: 'clinic',
      resourceId: clinicId,
    });

    return NextResponse.json({ data: { public_url: coverUrl } }, { status: 201 });
  } catch (err) {
    if (storagePath) {
      const { error: cleanupError } = await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([storagePath]);
      if (cleanupError) {
        logEvent('public_page_cover_cleanup_error', {
          clinicId,
          storagePath,
          error: cleanupError.message,
        }, 'error');
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    logEvent('public_page_cover_save_error', { clinicId, error: message }, 'error');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'تعذر رفع صورة الغلاف وحفظها في إعدادات الصفحة العامة' },
      { status: 500 }
    );
  }
}
