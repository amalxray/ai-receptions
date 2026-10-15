import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';

const querySchema = z.object({ clinic_id: z.string().uuid() });

/** إحصائيات — المنشور فقط: total + average + distribution {1..5}. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({ clinic_id: url.searchParams.get('clinic_id') });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request parameters', details: parsed.error.errors }, { status: 400 });
    }
    const clinicId = parsed.data.clinic_id;

    const auth = await authorizeClinicRequest(req, clinicId);
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
    const gate = roleDenied(auth, ADMIN_ROLES);
    if (gate) return NextResponse.json({ error: 'لا تملك صلاحية الإدارة' }, { status: 403 });

    const { data, error } = await supabaseAdmin
      .from('clinic_reviews')
      .select('rating')
      .eq('clinic_id', clinicId)
      .eq('is_published', true)
      .is('deleted_at', null);
    if (error) {
      logEvent('review_stats_failed', { clinic_id: clinicId, error: error.message }, 'error');
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const ratings = (data ?? []).map((row) => Number(row.rating));
    const total = ratings.length;
    const average = total ? Math.round((ratings.reduce((a, b) => a + b, 0) / total) * 100) / 100 : 0;
    const distribution: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const rating of ratings) distribution[String(rating)] += 1;

    return NextResponse.json({ data: { total, average, distribution } });
  } catch (err) {
    logEvent('review_stats_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}