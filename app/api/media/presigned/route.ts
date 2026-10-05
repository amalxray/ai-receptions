import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeClinicRequest,
  roleDenied,
  ADMIN_ROLES,
} from '@/lib/services/clinicAuthorization';
import {
  buildMediaStoragePath,
  MEDIA_BUCKET,
  validateMediaFile,
} from '@/lib/services/clinicPublicMedia';
import { logEvent } from '@/lib/server/logging';
import { supabaseAdmin } from '@/lib/supabase/admin';

const requestSchema = z.object({
  clinic_id: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().min(1).max(100),
  fileSize: z.number().int().positive(),
});

export async function POST(req: Request) {
  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'بيانات الملف غير صالحة' }, { status: 400 });
    }

    const { clinic_id: clinicId, filename, contentType, fileSize } = parsed.data;
    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized || roleDenied(authorization, ADMIN_ROLES)) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }

    const validation = validateMediaFile({ name: filename, type: contentType, size: fileSize });
    if ('message' in validation) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    const path = buildMediaStoragePath(clinicId, validation.ext);
    const { data, error } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error) {
      logEvent('clinic_media_signed_upload_error', { clinic_id: clinicId, error: error.message }, 'error');
      return NextResponse.json({ error: 'تعذر إنشاء رابط الرفع المؤقت' }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl, path: data.path });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('clinic_media_signed_upload_exception', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
