import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import {
  clinicSubdomain,
  isReservedSubdomain,
  isValidTenantSlug,
  normalizeTenantSlug,
} from '@/lib/vercel/domains';

/**
 * GET /api/clinic/check-slug?slug=… — public availability check for a tenant
 * slug / subdomain label.
 *
 * Returns `{ available, slug, domain, reason? }`. Public by design: the caller
 * is the registration/settings form, and the answer is already observable from
 * the public `/{slug}` page and from DNS. It reveals nothing about a tenant
 * beyond "this name is taken" and performs no mutation.
 *
 * `reason` is one of: empty | invalid | reserved | taken.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = normalizeTenantSlug(searchParams.get('slug'));
  const domain = slug ? clinicSubdomain(slug) : null;

  if (!slug) {
    return NextResponse.json({ available: false, slug, domain, reason: 'empty' });
  }

  if (!isValidTenantSlug(slug)) {
    return NextResponse.json({ available: false, slug, domain, reason: 'invalid' });
  }

  if (isReservedSubdomain(slug)) {
    return NextResponse.json({ available: false, slug, domain, reason: 'reserved' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('clinics')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const available = !data;
    logEvent('clinic_slug_checked', { available, reason: available ? 'ok' : 'taken' });

    return NextResponse.json({
      available,
      slug,
      domain,
      reason: available ? undefined : 'taken',
    });
  } catch (error) {
    logEvent('clinic_slug_check_failed', { error: String(error) }, 'error');
    return NextResponse.json({ error: 'Slug check failed', detail: String(error) }, { status: 500 });
  }
}
