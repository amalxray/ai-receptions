/**
 * CLINIC BADGES — verifiable achievement badges (Phase 5).
 * Tenant-scoped rows; icon/verify are owner-provided https URLs (text-only
 * rendering on the public page — no raw HTML, no injection surface).
 */
import { supabaseAdmin } from '@/lib/supabase/admin';

export type BadgeType = 'certification' | 'award' | 'membership' | 'achievement';

export const BADGE_TYPES: BadgeType[] = ['certification', 'award', 'membership', 'achievement'];

export const BADGE_TYPE_AR: Record<BadgeType, { label: string; icon: string }> = {
  certification: { label: 'شهادة اعتماد', icon: '📜' },
  award: { label: 'جائزة', icon: '🏆' },
  membership: { label: 'عضوية', icon: '🤝' },
  achievement: { label: 'إنجاز', icon: '⭐' },
};

export type ClinicBadge = {
  id: string;
  type: BadgeType;
  title: string;
  issuer: string | null;
  year: number | null;
  icon_url: string | null;
  verify_url: string | null;
  display_order: number;
  enabled: boolean;
};

export async function listClinicBadges(clinicId: string, opts?: { activeOnly?: boolean }): Promise<ClinicBadge[]> {
  let q = supabaseAdmin
    .from('clinic_badges')
    .select('id, type, title, issuer, year, icon_url, verify_url, display_order, enabled')
    .eq('clinic_id', clinicId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(60);
  if (opts?.activeOnly) q = q.eq('enabled', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ClinicBadge[];
}

export type BadgeInput = {
  type: string;
  title: string;
  issuer?: string;
  year?: number;
  icon_url?: string;
  verify_url?: string;
};

/** Validate a badge payload (bounded, https-only URLs) — returns an Arabic error message or null when valid. */
export function validateBadgeInput(input: BadgeInput): string | null {
  if (!BADGE_TYPES.includes(input.type as BadgeType)) return 'نوع الشارة غير صالح';
  if (!input.title?.trim()) return 'عنوان الشارة مطلوب';
  const https = (u?: string) => !u || /^https:\/\/[^\s]+$/i.test(u.trim());
  if (!https(input.icon_url)) return 'رابط الأيقونة يجب أن يكون https';
  if (!https(input.verify_url)) return 'رابط التحقق يجب أن يكون https';
  if (input.year !== undefined && (!Number.isInteger(input.year) || input.year < 1900 || input.year > 2100)) {
    return 'السنة غير صالحة';
  }
  return null;
}

export async function createClinicBadge(clinicId: string, input: BadgeInput): Promise<{ ok: true; item: ClinicBadge } | { ok: false; message: string }> {
  const validationError = validateBadgeInput(input);
  if (validationError) return { ok: false, message: validationError };
  const { data, error } = await supabaseAdmin
    .from('clinic_badges')
    .insert({
      clinic_id: clinicId,
      type: input.type,
      title: input.title.trim().slice(0, 200),
      issuer: input.issuer?.trim().slice(0, 200) || null,
      year: input.year ?? null,
      icon_url: input.icon_url?.trim() || null,
      verify_url: input.verify_url?.trim() || null,
    })
    .select('id, type, title, issuer, year, icon_url, verify_url, display_order, enabled')
    .single();
  if (error) return { ok: false, message: error.message };
  return { ok: true, item: data as ClinicBadge };
}

export async function updateClinicBadge(
  clinicId: string,
  badgeId: string,
  patch: Partial<BadgeInput> & { enabled?: boolean; display_order?: number }
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabaseAdmin
    .from('clinic_badges')
    .update({
      ...(patch.type !== undefined && BADGE_TYPES.includes(patch.type as BadgeType) ? { type: patch.type } : {}),
      ...(patch.title !== undefined ? { title: patch.title?.trim().slice(0, 200) || null } : {}),
      ...(patch.issuer !== undefined ? { issuer: patch.issuer?.trim().slice(0, 200) || null } : {}),
      ...(patch.year !== undefined ? { year: patch.year } : {}),
      ...(patch.icon_url !== undefined ? { icon_url: patch.icon_url?.trim() || null } : {}),
      ...(patch.verify_url !== undefined ? { verify_url: patch.verify_url?.trim() || null } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.display_order !== undefined && Number.isInteger(patch.display_order) ? { display_order: patch.display_order } : {}),
    })
    .eq('clinic_id', clinicId)
    .eq('id', badgeId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function deleteClinicBadge(clinicId: string, badgeId: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabaseAdmin
    .from('clinic_badges')
    .delete()
    .eq('clinic_id', clinicId)
    .eq('id', badgeId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}