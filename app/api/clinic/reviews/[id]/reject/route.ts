import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';

const idSchema = z.string().uuid();

/** رفض (إخفاء + سجل) — is_published=false + rejected_at. لا حذف فيزيائي. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const parsedId = idSchema.safeParse(params.id);
    if (!parsedId.success) return NextResponse.json({ error: 'Invalid review id' }, { status: 400 });
    const reviewId = parsedId.data;

    const { data: review, error } = await supabaseAdmin
      .from('clinic_reviews')
      .select('id, clinic_id, deleted_at')
      .eq('id', reviewId)
      .maybeSingle();
    if (error || !review || review.deleted_at) {
      return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    }

    const auth = await authorizeClinicRequest(req, review.clinic_id);
    if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status });
    const gate = roleDenied(auth, ADMIN_ROLES);
    if (gate) return NextResponse.json({ error: 'لا تملك صلاحية الإدارة' }, { status: 403 });

    const { data: updated, error: updError } = await supabaseAdmin
      .from('clinic_reviews')
      .update({ is_published: false, rejected_at: new Date().toISOString() })
      .eq('id', reviewId)
      .eq('clinic_id', review.clinic_id)
      .is('deleted_at', null)
      .select('id, is_published')
      .single();
    if (updError || !updated) {
      logEvent('review_reject_failed', { review_id: reviewId, error: updError?.message ?? 'unknown' }, 'error');
      return NextResponse.json({ error: 'تعذر رفض التقييم' }, { status: 500 });
    }

    logEvent('review_rejected', { clinic_id: review.clinic_id, review_id: reviewId });
    return NextResponse.json({ data: { id: updated.id, is_published: false } });
  } catch (err) {
    logEvent('review_reject_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}