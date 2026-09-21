import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { addClinicSubdomain } from '@/lib/vercel/domains';
import { createClinicEmailRule } from '@/lib/cloudflare/email';
import { persistClinicProvisioning } from '@/lib/services/clinicProvisioning';
import { logEvent } from '@/lib/server/logging';

const bodySchema = z.object({
  clinic_id: z.string().uuid('clinic_id must be a UUID'),
  /** Desired mailbox local part, e.g. "hala" → hala@dentairec.com. Optional. */
  mailbox_local: z.string().max(64).optional(),
});

/**
 * Unified tenant onboarding — the one endpoint that wires a clinic's external
 * identities together:
 *   1. subdomain — addClinicSubdomain() registers `{slug}.dentairec.com` on
 *      the Vercel project (idempotent).
 *   2. mailbox   — createClinicEmailRule() creates `{local}@dentairec.com`
 *      forwarding (idempotent; platform mailboxes are rejected).
 *   3. state     — persisted in `clinics.settings.tenant` (best-effort).
 * Safe to re-run: both external calls report `alreadyExisted` as success.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      );
    }
    const { clinic_id: clinicId, mailbox_local: mailboxLocal } = parsed.data;

    // Owner/manager only — subdomain + mailbox are clinic-wide identities.
    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }
    const denied = roleDenied(authorization, ADMIN_ROLES);
    if (denied) {
      return NextResponse.json({ error: 'Forbidden' }, { status: denied.status });
    }

    const { data: clinic, error: clinicError } = await supabaseAdmin
      .from('clinics')
      .select('id, slug')
      .eq('id', clinicId)
      .is('deleted_at', null)
      .maybeSingle();
    if (clinicError) throw new Error(clinicError.message);
    if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });

    const subdomain = await addClinicSubdomain(clinic.slug);

    let mailbox: Awaited<ReturnType<typeof createClinicEmailRule>> | null = null;
    if (mailboxLocal) mailbox = await createClinicEmailRule(mailboxLocal);

    await persistClinicProvisioning(clinic.id, {
      ...(subdomain.success ? { subdomain: subdomain.domain } : {}),
      subdomain_status: subdomain.success ? 'active' : 'failed',
      ...(subdomain.success ? {} : { subdomain_error: subdomain.error }),
      ...(mailbox?.address ? { mailbox: mailbox.address } : {}),
      ...(mailbox
        ? {
            mailbox_status: mailbox.success
              ? 'active'
              : mailbox.needsVerification
                ? 'needs_verification'
                : 'failed',
            ...(mailbox.success || mailbox.needsVerification ? {} : { mailbox_error: mailbox.error }),
          }
        : {}),
    });

    logEvent('clinic_onboarding_completed', {
      clinic_id: clinic.id,
      subdomain: subdomain.success ? subdomain.domain : null,
      subdomain_ok: subdomain.success,
      mailbox: mailbox?.address ?? null,
      mailbox_ok: mailbox ? mailbox.success : null,
    });

    return NextResponse.json({ data: { subdomain, mailbox } }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('clinic_onboarding_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
