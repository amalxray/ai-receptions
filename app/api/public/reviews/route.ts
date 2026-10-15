import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { filterMedicalReview, sanitizePII } from '@/lib/services/medicalReviewFilter';
import { checkReviewRateLimit, sha256 } from '@/lib/services/reviewRateLimit';
import { logEvent } from '@/lib/server/logging';

const createReviewSchema = z.object({
  clinic_slug: z.string().trim().min(1).max(120),
  rating: z.coerce.number().int().min(1).max(5),
  author_name: z.string().trim().min(1).max(100),
  comment: z.string().trim().max(1000).optional().nullable(),
  patient_phone: z.string().trim().min(5).max(30).optional().nullable(),
  source: z.enum(['form', 'chat', 'cron', 'public']).default('form'),
});

async function resolveClinicId(slug: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('clinics')
    .select('id')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  return data?.id ?? null;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = createReviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid review', details: parsed.error.errors }, { status: 400 });
    }
    const input = parsed.data;

    const clinicId = await resolveClinicId(input.clinic_slug);
    if (!clinicId) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const ipHash = sha256(clientIp(req));
    const phoneHash = input.patient_phone ? sha256(input.patient_phone) : null;

    const decision = await checkReviewRateLimit({ clinicId, ipHash, phoneHash });
    if (!decision.allowed) {
      logEvent('review_rate_limited', { clinic_id: clinicId, scope: decision.scope });
      return NextResponse.json({ error: 'تم إرسال تقييم كثيراً. حاول لاحقاً.' }, { status: 429 });
    }

    // (ج) تطهير PII قبل الحفظ — النص الأصلي مع [***] فقط
    const rawComment = input.comment ?? '';
    const comment = sanitizePII(rawComment);
    const piiMasked = comment !== rawComment;

    // Hybrid: لغة طبية → pending؛ وإلا منشور فوراً (PII لا يحجب)
    const filter = filterMedicalReview(input.comment);
    const isPublished = !filter.flagged;
    const flagReason = filter.flagged
      ? filter.reason
      : piiMasked ? 'PII تم إخفاؤه' : null;

    const { data, error } = await supabaseAdmin
      .from('clinic_reviews')
      .insert({
        clinic_id: clinicId,
        rating: input.rating,
        author_name: input.author_name,
        comment: comment || null,
        source: input.source,
        is_published: isPublished,
        flagged_medical: filter.flagged,
        flag_reason: flagReason,
        ip_hash: ipHash,
        patient_phone_hash: phoneHash,
        published_at: isPublished ? new Date().toISOString() : null,
      })
      .select('id, is_published, flagged_medical')
      .single();

    if (error || !data) {
      logEvent('review_insert_failed', { clinic_id: clinicId, error: error?.message ?? 'unknown' }, 'error');
      return NextResponse.json({ error: 'تعذر حفظ التقييم. حاول مرة أخرى.' }, { status: 500 });
    }

    logEvent('review_created', {
      clinic_id: clinicId,
      review_id: data.id,
      flagged: filter.flagged,
      pii_masked: piiMasked,
      published: isPublished,
    });

    // Phase 5 — IndexNow ping on publish (fire-and-forget, never blocks).
    if (isPublished) {
      const { pingIndexNow } = await import('@/lib/services/indexNow');
      const { getAppBaseUrl } = await import('@/lib/communications/links');
      const base = getAppBaseUrl();
      void pingIndexNow([`${base}/${input.clinic_slug}/reviews`]);
    }

    return NextResponse.json(
      { data: { review_id: data.id, is_published: isPublished, flagged_medical: filter.flagged } },
      { status: 201 },
    );
  } catch (err) {
    logEvent('review_create_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const listQuerySchema = z.object({
  clinic: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const parsed = listQuerySchema.safeParse({
      clinic: url.searchParams.get('clinic'),
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request parameters', details: parsed.error.errors }, { status: 400 });
    }
    const { clinic, limit, offset } = parsed.data;

    const clinicId = await resolveClinicId(clinic);
    if (!clinicId) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const { data, error, count } = await supabaseAdmin
      .from('clinic_reviews')
      .select('id, rating, author_name, comment, is_verified, created_at', { count: 'exact' })
      .eq('clinic_id', clinicId)
      .eq('is_published', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logEvent('review_list_failed', { clinic_id: clinicId, error: error.message }, 'error');
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    return NextResponse.json({ data: { items: data ?? [], total: count ?? 0, limit, offset } });
  } catch (err) {
    logEvent('review_list_error', { error: err instanceof Error ? err.message : String(err) }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}