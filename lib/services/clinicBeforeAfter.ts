/**
 * CLINIC BEFORE/AFTER GALLERY — tenant-scoped case showcase (Phase 4).
 * Same invariants as clinicPublicMedia: binaries in the `clinic-public-media`
 * bucket under `clinic/{clinicId}/before-after/...`, metadata in Postgres,
 * every write keyed by clinic_id AFTER authorizeClinicRequest.
 * patient_consent is HARD-REQUIRED: createClinicBeforeAfter refuses to store
 * a case without it (medical-ethics gate, not just a UI checkbox).
 */
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type BeforeAfterCase = {
  id: string;
  title: string;
  description: string | null;
  before_url: string;
  after_url: string;
  patient_consent: boolean;
  display_order: number;
  enabled: boolean;
  created_at: string | null;
};

export const BA_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** Single-object result (no union): `error` is an Arabic message or null when valid. */
function validateImage(file: { type: string; size: number }): { ext: string; error: string | null } {
  const ext = IMAGE_MIME[file.type];
  if (!ext) return { ext: '', error: 'الصور المقبولة فقط: JPG / PNG / WebP' };
  if (file.size <= 0 || file.size > BA_MAX_BYTES) {
    return { ext: '', error: `حجم الصورة يجب أن يكون بين 1 و ${Math.round(BA_MAX_BYTES / 1024 / 1024)}MB` };
  }
  return { ext, error: null };
}

function publicUrl(path: string): string {
  const { data } = supabaseAdmin.storage.from('clinic-public-media').getPublicUrl(path);
  return data.publicUrl;
}

const CASE_COLUMNS = 'id, title, description, before_url, after_url, patient_consent, display_order, enabled, created_at';

export async function listClinicBeforeAfter(clinicId: string, opts?: { activeOnly?: boolean }): Promise<BeforeAfterCase[]> {
  let q = supabaseAdmin
    .from('clinic_before_after')
    .select(CASE_COLUMNS)
    .eq('clinic_id', clinicId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(100);
  if (opts?.activeOnly) q = q.eq('enabled', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as BeforeAfterCase[];
}

export async function createClinicBeforeAfter(
  clinicId: string,
  input: {
    title: string;
    description?: string;
    beforeFile: File;
    afterFile: File;
    patient_consent: boolean;
  }
): Promise<{ ok: true; item: BeforeAfterCase } | { ok: false; message: string }> {
  if (!input.patient_consent) {
    return { ok: false, message: 'موافقة المريض إلزامية قبل نشر الحالة' };
  }
  if (!input.title.trim()) return { ok: false, message: 'العنوان مطلوب' };
  const beforeImg = validateImage(input.beforeFile);
  if (beforeImg.error) return { ok: false, message: beforeImg.error };
  const afterImg = validateImage(input.afterFile);
  if (afterImg.error) return { ok: false, message: afterImg.error };

  const beforePath = `clinic/${clinicId}/before-after/${randomUUID()}${beforeImg.ext}`;
  const afterPath = `clinic/${clinicId}/before-after/${randomUUID()}${afterImg.ext}`;

  const { error: upErr } = await supabaseAdmin.storage.from('clinic-public-media').upload(beforePath, input.beforeFile, {
    contentType: input.beforeFile.type,
    upsert: false,
  });
  if (upErr) return { ok: false, message: `تعذر رفع صورة «قبل»: ${upErr.message}` };
  const { error: upErr2 } = await supabaseAdmin.storage.from('clinic-public-media').upload(afterPath, input.afterFile, {
    contentType: input.afterFile.type,
    upsert: false,
  });
  if (upErr2) {
    await supabaseAdmin.storage.from('clinic-public-media').remove([beforePath]);
    return { ok: false, message: `تعذر رفع صورة «بعد»: ${upErr2.message}` };
  }

  const { data, error } = await supabaseAdmin
    .from('clinic_before_after')
    .insert({
      clinic_id: clinicId,
      title: input.title.trim().slice(0, 200),
      description: input.description?.trim().slice(0, 1000) || null,
      before_url: publicUrl(beforePath),
      after_url: publicUrl(afterPath),
      before_path: beforePath,
      after_path: afterPath,
      patient_consent: true,
    })
    .select(CASE_COLUMNS)
    .single();
  if (error) {
    await supabaseAdmin.storage.from('clinic-public-media').remove([beforePath, afterPath]);
    return { ok: false, message: `تعذر حفظ الحالة: ${error.message}` };
  }
  return { ok: true, item: data as BeforeAfterCase };
}

export async function updateClinicBeforeAfter(
  clinicId: string,
  caseId: string,
  patch: { title?: string | null; description?: string | null; enabled?: boolean; display_order?: number }
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabaseAdmin
    .from('clinic_before_after')
    .update({
      ...(patch.title !== undefined ? { title: patch.title?.trim().slice(0, 200) || null } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim().slice(0, 1000) || null } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.display_order !== undefined && Number.isInteger(patch.display_order) ? { display_order: patch.display_order } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('clinic_id', clinicId)
    .eq('id', caseId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function deleteClinicBeforeAfter(clinicId: string, caseId: string): Promise<{ ok: boolean; message?: string }> {
  const { data: row, error: readError } = await supabaseAdmin
    .from('clinic_before_after')
    .select('before_path, after_path')
    .eq('clinic_id', clinicId)
    .eq('id', caseId)
    .maybeSingle();
  if (readError) return { ok: false, message: readError.message };
  if (!row) return { ok: false, message: 'Case not found' };

  const { error: delError } = await supabaseAdmin
    .from('clinic_before_after')
    .delete()
    .eq('clinic_id', clinicId)
    .eq('id', caseId);
  if (delError) return { ok: false, message: delError.message };

  await supabaseAdmin.storage.from('clinic-public-media').remove([row.before_path, row.after_path]);
  return { ok: true };
}