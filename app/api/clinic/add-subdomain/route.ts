import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ADMIN_ROLES, authorizeClinicRequest, roleDenied } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import {
  addClinicSubdomain,
  clinicSubdomain,
  isReservedSubdomain,
  isValidTenantSlug,
  normalizeTenantSlug,
} from '@/lib/vercel/domains';

/**
 * POST /api/clinic/add-subdomain — registers `{slug}.dentairec.com` on the
 * Vercel project so the clinic subdomain serves this deployment.
 *
 * SECURITY (deviation from a bare "call the Vercel API" helper): this endpoint
 * mutates platform-wide routing, so it is gated like every other clinic config
 * write —
 *   1. Bearer token → real authenticated user (`authorizeClinicRequest`).
 *   2. Membership row in `clinic_users` for the requested clinic.
 *   3. ADMIN_ROLES only (owner/manager).
 *   4. The requested slug MUST be that clinic's own slug, so a member of one
 *      clinic can never claim another tenant's host.
 *
 * Idempotent by contract: an already-registered domain returns success.
 */
const bodySchema = z.object({
  clinic_id: z.string().uuid(),
  slug: z.string().min(1).max(63),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'clinic_id and slug are required' }, { status: 400 });
    }

    const { clinic_id } = parsed.data;
    const slug = normalizeTenantSlug(parsed.data.slug);
    const domain = clinicSubdomain(slug);

    if (!isValidTenantSlug(slug) || isReservedSubdomain(slug)) {
      return NextResponse.json(
        { success: false, error: 'Invalid or reserved slug', code: 'invalid_slug', domain },
        { status: 400 }
      );
    }

    const authorization = await authorizeClinicRequest(request, clinic_id);
    const denied = roleDenied(authorization, ADMIN_ROLES);
    if (denied) {
      return NextResponse.json(
        { error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: denied.status }
      );
    }

    // The subdomain must belong to the clinic the caller administers.
    const { data: clinic, error: clinicError } = await supabaseAdmin
      .from('clinics')
      .select('id, slug')
      .eq('id', clinic_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (clinicError) throw new Error(clinicError.message);
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    if (clinic.slug !== slug) {
      logEvent('clinic_subdomain_slug_mismatch', { clinic_id, requested: slug }, 'warn');
      return NextResponse.json(
        { success: false, error: 'slug does not match this clinic', code: 'slug_mismatch', domain },
        { status: 403 }
      );
    }

    const result = await addClinicSubdomain(slug);

    // NOTE: discriminated with `'error' in result` rather than `if
    // (!result.success)`: the project compiles with `strict: false`, where
    // negated/truthiness narrowing of the `success` discriminant does not apply
    // and `result.error`/`result.code` would be type errors. Verified with the
    // local tsc.
    if ('error' in result) {
      logEvent(
        'clinic_subdomain_add_failed',
        { clinic_id, slug, code: result.code ?? 'unknown', error: result.error },
        'error'
      );
      return NextResponse.json(result, { status: 502 });
    }

    logEvent('clinic_subdomain_added', {
      clinic_id,
      slug,
      domain: result.domain,
      verified: result.verified,
      already_existed: result.alreadyExisted,
    });

    return NextResponse.json(result);
  } catch (error) {
    logEvent('clinic_subdomain_add_failed', { error: String(error) }, 'error');
    return NextResponse.json({ error: 'Subdomain setup failed', detail: String(error) }, { status: 500 });
  }
}
