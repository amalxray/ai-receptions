import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { normalizeActivityType } from '@/lib/services/activityTypes';

export const runtime = 'nodejs';

const querySchema = z.object({
  clinic_id: z.string().uuid(),
  filter: z.enum(['all', 'pending', 'published', 'rejected', 'flagged']).default('all'),
  search: z.string().trim().max(200).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  reviewer_category: z.enum(['all', 'dentist', 'reviewer', 'other', 'unknown']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Phase 4a — staff list of reviews with filters + stats.
 * Auth: clinic membership plus the effective `view_reviews` permission.
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
      reviewer_category: url.searchParams.get('reviewer_category') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request parameters', details: parsed.error.errors }, { status: 400 });
    }
    const { clinic_id: clinicId, filter, search, rating, reviewer_category: reviewerCategory, limit, offset } = parsed.data;

    const gate = await permissionDenied(req, clinicId, 'view_reviews', { allowedRoles: ADMIN_ROLES });
    if (gate) return gate;

    const { data: clinic, error: clinicError } = await supabaseAdmin
      .from('clinics')
      .select('activity_type')
      .eq('id', clinicId)
      .maybeSingle();
    if (clinicError) {
      logEvent('review_clinic_activity_type_unavailable', { clinic_id: clinicId, error: clinicError.message }, 'warn');
    }
    const showReviewerCategory = !clinicError && normalizeActivityType(clinic?.activity_type) === 'imaging_center';

    const reviewColumns: string = showReviewerCategory
      ? 'id, rating, reviewer_category, author_name, comment, source, is_published, is_verified, flagged_medical, flag_reason, published_at, rejected_at, created_at'
      : 'id, rating, author_name, comment, source, is_published, is_verified, flagged_medical, flag_reason, published_at, rejected_at, created_at';
    let query = supabaseAdmin
      .from('clinic_reviews')
      .select(reviewColumns, { count: 'exact' })
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
    if (showReviewerCategory) {
      if (reviewerCategory === 'unknown') {
        query = query.is('reviewer_category', null);
      } else if (reviewerCategory !== 'all') {
        query = query.eq('reviewer_category', reviewerCategory);
      }
    }
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
