export const preferredRegion = 'icn1';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';

const querySchema = z.object({
  clinic_id: z.string().uuid(),
  filter: z.enum(['all', 'pending', 'published', 'rejected', 'flagged']).default('all'),
  search: z.string().trim().max(200).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Phase 4a — staff list of reviews with filters + stats.
 * Auth: authorizeClinicRequest + ADMIN_ROLES (same as stats/publish/reject).
 * Only non-deleted rows (deleted_at IS NULL).
 * filter: all | pending (new, unpublished, not rejected) | published |
 *   rejected | flagged (flagged_medical, unpublished).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      clinic_id: url.searchParams.get('clinic_id'),
      filter: url.searchParams.get('filter') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      rating: url.searchParams.get('rating') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request parameters', details: parsed.error.errors }, { status: 400 });
    }
    const { clinic_id: clinicId, filter, search, rating, limit, offset } = parsed.data;

    const auth = await authorizeClinicRequest(req, clinicId);
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
    const gate = roleDenied(auth, ADMIN_ROLES);
    if (gate) return NextResponse.json({ error: 'لا تملك صلاحية الإدارة' }, { status: 403 });

    let query = supabaseAdmin
      .from('clinic_reviews')
      .select('id, rating, author_name, comment, source, is_published, is_verified, flagged_medical, flag_reason, published_at, rejected_at, created_at', { count: 'exact' })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null);

    if (filter === 'pending') {
      query = query.eq('is_published', false).is('rejected_at', null);
    } else if (filter === 'published') {
      query = query.eq('is_published', true);
    } else if (filter === 'rejected') {
      query = query.not('rejected_at', 'is', null);
    } else if (filter === 'flagged') {
      query = query.eq('flagged_medical', true).eq('is_published', false);
    }
    if (rating) query = query.eq('rating', rating);
    if (search) query = query.or(`author_name.ilike.%${search}%,comment.ilike.%${search}%`);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logEvent('review_list_staff_failed', { clinic_id: clinicId, error: error.message }, 'error');
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Header stats (single extra query — cheap, same table).
    const { data: all } = await supabaseAdmin
      .from('clinic_reviews')
      .select('rating, is_published, rejected_at, flagged_medical')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null);

    const rows: Array<{ rating: number | string; is_published: boolean; rejected_at: string | null; flagged_medical: boolean }> = all ?? [];
    const pub = rows.filter((r) => r.is_published);
    const stats = {
      total: rows.length,
      published: pub.length,
      pending: rows.filter((r) => !r.is_published && !r.rejected_at).length,
      rejected: rows.filter((r) => Boolean(r.rejected_at)).length,
      average: pub.length ? Math.round((pub.reduce((a, b) => a + Number(b.rating), 0) / pub.length) * 100) / 100 : 0,
    };

    return NextResponse.json({ data: { items: data ?? [], total: count ?? 0, limit, offset, stats } });
  } catch (err) {
    logEvent('review_list_staff_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
