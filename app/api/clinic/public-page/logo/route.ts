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

/** POST /api/clinic/public-page/logo — upload and persist a tenant logo in one request.
 *  Mirrors the cover upload: same bucket, validation, audit and cleanup path. */
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
      return NextResponse.json({ error: 'يُسمح برفع الصور فقط كشعار' }, { status: 400 });
    }

    storagePath = buildMediaStoragePath(clinicId, validation.ext);
    const { error: uploadError } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      logEvent('public_page_logo_upload_error', { clinicId, error: uploadError.message }, 'error');
      return NextResponse.json({ error: `تعذر رفع الشعار إلى التخزين: ${uploadError.message}` }, { status: 500 });
    }

    const logoUrl = mediaPublicUrl(storagePath);
    const saveResult = await updatePublicPageConfig(clinicId, { logo: logoUrl });
    if (!saveResult.ok) throw new Error(saveResult.message ?? 'تعذر حفظ رابط الشعار');

    await writeAuditLog({
      clinicId,
      actorUserId: authorization.user?.id ?? null,
      action: 'clinic.public_page.logo.update',
      resourceType: 'clinic',
      resourceId: clinicId,
    });

    return NextResponse.json({ data: { public_url: logoUrl } }, { status: 201 });
  } catch (err) {
    if (storagePath) {
      const { error: cleanupError } = await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([storagePath]);
      if (cleanupError) {
        logEvent('public_page_logo_cleanup_error', {
          clinicId,
          storagePath,
          error: cleanupError.message,
        }, 'error');
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    logEvent('public_page_logo_save_error', { clinicId, error: message }, 'error');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'تعذر رفع الشعار وحفظه في إعدادات الصفحة العامة' },
      { status: 500 }
    );
  }
}
