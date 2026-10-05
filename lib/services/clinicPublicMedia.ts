import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * CLINIC PUBLIC MEDIA — tenant-scoped public gallery infrastructure.
 *
 * Binaries live in Supabase Storage (bucket `clinic-public-media`) under a
 * tenant-isolated path `clinic/{clinicId}/public-media/...`; Postgres keeps
 * metadata only. Every mutating call is keyed by clinic_id AFTER
 * authorizeClinicRequest, so a tenant can only ever touch its own rows and
 * objects. Public renderers read `enabled` rows only.
 *
 * Security invariants (matching the 20260921 migration):
 *   - MIME is validated server-side (never trust the extension alone), images
 *     are capped at 25 MiB and videos at 500 MiB, and storage keys use UUIDs.
 *   - Storage object policy + table RLS both restrict to clinic members.
 *   - No service_role usage from the browser; all writes go through this API.
 */

export type MediaType = 'image' | 'video';

export type MediaCategory = 'clinic' | 'team' | 'equipment' | 'cases' | 'other';

export const MEDIA_CATEGORIES: MediaCategory[] = ['clinic', 'team', 'equipment', 'cases', 'other'];

export type PublicMediaItem = {
  id: string;
  media_type: MediaType;
  public_url: string;
  title: string | null;
  caption: string | null;
  alt_text: string | null;
  category: MediaCategory;
  display_order: number;
  enabled: boolean;
  file_size_bytes: number | null;
  mime_type: string | null;
  created_at: string | null;
};

export type MediaMetaPatch = {
  title?: string | null;
  caption?: string | null;
  alt_text?: string | null;
  category?: MediaCategory;
  enabled?: boolean;
  display_order?: number;
};

export const MEDIA_BUCKET = 'clinic-public-media';
export const MEDIA_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
export const MEDIA_VIDEO_MAX_BYTES = 500 * 1024 * 1024;

const MEDIA_MIME_MAP: Record<string, { type: MediaType; ext: string }> = {
  'image/jpeg': { type: 'image', ext: '.jpg' },
  'image/png': { type: 'image', ext: '.png' },
  'image/webp': { type: 'image', ext: '.webp' },
  'image/gif': { type: 'image', ext: '.gif' },
  'video/mp4': { type: 'video', ext: '.mp4' },
  'video/webm': { type: 'video', ext: '.webm' },
  'video/quicktime': { type: 'video', ext: '.mov' },
};
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.mov'];

/** Validate a file before upload — MIME + size + extension whitelists. */
export function validateMediaFile(file: {
  name: string;
  type: string;
  size: number;
}): { ok: true; mediaType: MediaType; ext: string } | { ok: false; message: string } {
  const entry = MEDIA_MIME_MAP[file.type];
  if (!entry) {
    return {
      ok: false,
      message: 'نوع الملف غير مدعوم. المقبول: JPG / PNG / WebP / GIF (صور)، MP4 / WebM / MOV (فيديو)',
    };
  }
  if (!Number.isFinite(file.size)) return { ok: false, message: 'حجم الملف غير صالح' };
  if (file.size <= 0) return { ok: false, message: 'الملف فارغ' };
  const maxBytes = entry.type === 'video' ? MEDIA_VIDEO_MAX_BYTES : MEDIA_IMAGE_MAX_BYTES;
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / 1024 / 1024);
    return { ok: false, message: `حجم الملف يتجاوز الحد الأقصى (${maxMb}MB)` };
  }
  const lower = file.name.toLowerCase().trim();
  const extension = ALLOWED_EXTS.find((candidate) => lower.endsWith(candidate));
  if (!extension) {
    return { ok: false, message: 'امتداد الملف غير مدعوم' };
  }
  const extensionMatchesMime =
    entry.ext === '.jpg'
      ? extension === '.jpg' || extension === '.jpeg'
      : extension === entry.ext;
  if (!extensionMatchesMime) {
    return { ok: false, message: 'امتداد الملف غير مدعوم' };
  }
  return { ok: true, mediaType: entry.type, ext: entry.ext };
}

/** Tenant-isolated, injection-safe storage path. Never uses the original filename. */
export function buildMediaStoragePath(clinicId: string, ext: string): string {
  return `clinic/${clinicId}/public-media/${randomUUID()}${ext}`;
}

export function mediaPublicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

export async function listClinicMedia(clinicId: string): Promise<PublicMediaItem[]> {
  const { data, error } = await supabaseAdmin
    .from('clinic_public_media')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('display_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicMediaItem[];
}

export async function createClinicMedia(
  clinicId: string,
  input: {
    file: File;
    title?: string;
    caption?: string;
    alt_text?: string;
    category?: string;
  }
): Promise<{ ok: true; item: PublicMediaItem } | { ok: false; message: string }> {
  const validation = validateMediaFile(input.file);
  if ('message' in validation) return validation;
  const category = MEDIA_CATEGORIES.includes(input.category as MediaCategory)
    ? (input.category as MediaCategory)
    : 'other';

  const path = buildMediaStoragePath(clinicId, validation.ext);
  const { error: uploadError } = await supabaseAdmin.storage
    .from(MEDIA_BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (uploadError) {
    return { ok: false, message: `تعذر رفع الملف إلى التخزين: ${uploadError.message}` };
  }

  const { data, error } = await supabaseAdmin
    .from('clinic_public_media')
    .insert({
      clinic_id: clinicId,
      media_type: validation.mediaType,
      storage_path: path,
      public_url: mediaPublicUrl(path),
      title: input.title?.trim() || null,
      caption: input.caption?.trim() || null,
      alt_text: input.alt_text?.trim() || null,
      category,
      file_size_bytes: input.file.size,
      mime_type: input.file.type,
    })
    .select('*')
    .single();
  if (error) {
    // Roll back the orphan object so no dangling storage remains.
    await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([path]);
    return { ok: false, message: `تعذر حفظ بيانات الملف: ${error.message}` };
  }
  return { ok: true, item: data as PublicMediaItem };
}

export async function createClinicMediaRecordFromUpload(
  clinicId: string,
  input: {
    path: string;
    filename: string;
    contentType: string;
    title?: string | null;
    caption?: string | null;
    alt_text?: string | null;
    category?: string;
  }
): Promise<{ ok: true; item: PublicMediaItem } | { ok: false; message: string }> {
  const prefix = `clinic/${clinicId}/public-media/`;
  const filename = input.path.startsWith(prefix) ? input.path.slice(prefix.length) : '';
  if (
    !filename ||
    filename.includes('/') ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|gif|mp4|webm|mov)$/i.test(filename)
  ) {
    return { ok: false, message: 'مسار الملف غير صالح لهذه العيادة' };
  }

  const { data: objects, error: listError } = await supabaseAdmin.storage
    .from(MEDIA_BUCKET)
    .list(prefix.slice(0, -1), { limit: 100, search: filename });
  if (listError) return { ok: false, message: `تعذر التحقق من الملف المرفوع: ${listError.message}` };
  const uploaded = objects?.find((object) => object.name === filename);
  if (!uploaded) return { ok: false, message: 'الملف غير موجود في التخزين' };

  const fileSize = Number(uploaded.metadata?.size);
  const mimeType = String(uploaded.metadata?.mimetype ?? '');
  const validation = validateMediaFile({
    name: input.filename,
    type: mimeType || input.contentType,
    size: fileSize,
  });
  if ('message' in validation) {
    await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([input.path]);
    return { ok: false, message: validation.message };
  }
  if (mimeType !== input.contentType) {
    await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([input.path]);
    return { ok: false, message: 'نوع الملف في التخزين لا يطابق النوع المصرّح به' };
  }
  if (`${filename.slice(36)}` !== validation.ext) {
    await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([input.path]);
    return { ok: false, message: 'امتداد الملف لا يطابق نوعه' };
  }

  const category = MEDIA_CATEGORIES.includes(input.category as MediaCategory)
    ? (input.category as MediaCategory)
    : 'other';
  const { data, error } = await supabaseAdmin
    .from('clinic_public_media')
    .insert({
      clinic_id: clinicId,
      media_type: validation.mediaType,
      storage_path: input.path,
      public_url: mediaPublicUrl(input.path),
      title: input.title?.trim() || null,
      caption: input.caption?.trim() || null,
      alt_text: input.alt_text?.trim() || null,
      category,
      file_size_bytes: fileSize,
      mime_type: mimeType,
    })
    .select('*')
    .single();
  if (error) {
    await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([input.path]);
    return { ok: false, message: `تعذر حفظ بيانات الملف: ${error.message}` };
  }
  return { ok: true, item: data as PublicMediaItem };
}

export async function updateClinicMedia(
  clinicId: string,
  mediaId: string,
  patch: MediaMetaPatch
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabaseAdmin
    .from('clinic_public_media')
    .update({
      ...(patch.title !== undefined ? { title: patch.title?.trim() || null } : {}),
      ...(patch.caption !== undefined ? { caption: patch.caption?.trim() || null } : {}),
      ...(patch.alt_text !== undefined ? { alt_text: patch.alt_text?.trim() || null } : {}),
      ...(patch.category !== undefined && MEDIA_CATEGORIES.includes(patch.category)
        ? { category: patch.category }
        : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.display_order !== undefined && Number.isInteger(patch.display_order)
        ? { display_order: patch.display_order }
        : {}),
    })
    .eq('clinic_id', clinicId)
    .eq('id', mediaId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function deleteClinicMedia(
  clinicId: string,
  mediaId: string
): Promise<{ ok: boolean; message?: string }> {
  const { data: row, error: readError } = await supabaseAdmin
    .from('clinic_public_media')
    .select('storage_path')
    .eq('clinic_id', clinicId)
    .eq('id', mediaId)
    .maybeSingle();
  if (readError) return { ok: false, message: readError.message };
  if (!row) return { ok: false, message: 'Media not found' };

  const { error: deleteError } = await supabaseAdmin
    .from('clinic_public_media')
    .delete()
    .eq('clinic_id', clinicId)
    .eq('id', mediaId);
  if (deleteError) return { ok: false, message: deleteError.message };

  await supabaseAdmin.storage.from(MEDIA_BUCKET).remove([row.storage_path]);
  return { ok: true };
}