import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { landingCopy } from '@/lib/landing/landing-copy';
import { getLandingSection, upsertLandingSection } from '@/lib/services/landingContent';
import { requirePlatformAdmin } from '@/lib/services/platformAdmin';
import { logEvent } from '@/lib/server/logging';
import { supabaseAdmin } from '@/lib/supabase/admin';

const BUCKET = 'landing-page-media';
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** POST /api/admin/landing-page/hero/image — upload and persist the Hero cover. */
export async function POST(req: Request) {
  const gate = await requirePlatformAdmin(req);
  if (!gate.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status });

  let storagePath: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'يجب اختيار صورة' }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'يجب أن يكون حجم الصورة بين 1 بايت و10 ميغابايت' }, { status: 400 });
    }

    const extension = IMAGE_EXTENSIONS[file.type];
    if (!extension) {
      return NextResponse.json({ error: 'نوع الصورة غير مدعوم. استخدم JPEG أو PNG أو WebP أو GIF' }, { status: 400 });
    }

    storagePath = `hero/${randomUUID()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(`تعذر رفع الصورة إلى التخزين: ${uploadError.message}`);

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
    const current = await getLandingSection('hero');
    const storedContent = current?.content;
    const content = storedContent && typeof storedContent === 'object' && !Array.isArray(storedContent)
      ? { ...(storedContent as Record<string, unknown>), image: data.publicUrl }
      : { ...landingCopy.hero, image: data.publicUrl };

    await upsertLandingSection('hero', content, gate.admin.user_id, current?.is_visible ?? true);
    revalidatePath('/');
    logEvent('admin_landing_hero_image_uploaded', { by: gate.admin.email, storagePath });

    return NextResponse.json({ data: { url: data.publicUrl } }, { status: 201 });
  } catch (err) {
    if (storagePath) {
      const { error: cleanupError } = await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
      if (cleanupError) {
        logEvent('admin_landing_hero_image_cleanup_error', { storagePath, error: cleanupError.message }, 'error');
      }
    }
    logEvent('admin_landing_hero_image_upload_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'تعذر رفع صورة الغلاف وحفظها' }, { status: 500 });
  }
}
