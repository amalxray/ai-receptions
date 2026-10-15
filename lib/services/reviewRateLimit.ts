import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type ReviewRateScope = 'ip' | 'phone' | 'clinic';
export type ReviewRateLimitDecision = { allowed: boolean; scope: ReviewRateScope | null };

export function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/** DB-based (serverless-safe) — لا in-memory. */
const WINDOWS: Record<ReviewRateScope, { column: string; hours: number; max: number }> = {
  ip: { column: 'ip_hash', hours: 1, max: 1 },
  phone: { column: 'patient_phone_hash', hours: 24 * 7, max: 1 },
  clinic: { column: 'clinic_id', hours: 24, max: 5 },
};

export async function checkReviewRateLimit(params: {
  clinicId: string;
  ipHash: string;
  phoneHash: string | null;
}): Promise<ReviewRateLimitDecision> {
  const ordered: Array<[ReviewRateScope, string | null]> = [
    ['ip', params.ipHash],
    ['phone', params.phoneHash],
    ['clinic', params.clinicId],
  ];
  for (const [scope, key] of ordered) {
    if (!key) continue;
    const { column, hours, max } = WINDOWS[scope];
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();
    try {
      const { count, error } = await supabaseAdmin
        .from('clinic_reviews')
        .select('id', { count: 'exact', head: true })
        .eq(column, key)
        .gte('created_at', since)
        .is('deleted_at', null);
      if (error) continue; // fail-open: عطل العدّاد لا يوقف التقييمات
      if ((count ?? 0) >= max) return { allowed: false, scope };
    } catch {
      continue;
    }
  }
  return { allowed: true, scope: null };
}