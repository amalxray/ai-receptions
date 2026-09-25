import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import {
  clinicSubdomain,
  isReservedSubdomain,
  isValidTenantSlug,
  normalizeTenantSlug,
} from '@/lib/vercel/domains';
import { isSubdomainReady } from '@/lib/vercel/subdomainReadiness';

/**
 * GET /api/clinic/check-slug?slug=… — public availability check for a tenant
 * slug / subdomain label.
 *
 * Returns `{ available, slug, domain, reason?, subdomain_ready? }`. Public by
 * design: the caller is the registration/settings form, and the answer is
 * already observable from the public `/{slug}` page and from DNS. It reveals
 * nothing about a tenant beyond "this name is taken" and performs no mutation.
 *
 * `reason` is one of: empty | invalid | reserved | taken.
 *
 * `subdomain_ready` (only meaningful for a taken slug) reports whether the
 * tenant host is registered on the Vercel project — the authoritative answer to
 * "would `https://{slug}.{root}` actually load right now?". Consumers (the
 * canonical-migration redirect needs it on the Edge; the dashboard shows it)
 * must treat `false`/absent as "not usable yet".
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

    // Readiness only matters for a slug that really is a tenant (an available
    // name has no host by definition) — it keeps the Vercel lookup off the
    // typo-probing path while still answering "is the tenant host usable?".
    const subdomainReady = available ? false : await isSubdomainReady(slug);

    return NextResponse.json({
      available,
      slug,
      domain,
      reason: available ? undefined : 'taken',
      ...(available ? {} : { subdomain_ready: subdomainReady }),
    });
  } catch (error) {
    logEvent('clinic_slug_check_failed', { error: String(error) }, 'error');
    return NextResponse.json({ error: 'Slug check failed', detail: String(error) }, { status: 500 });
  }
}
