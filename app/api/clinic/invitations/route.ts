import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { writeAuditLog } from '@/lib/services/auditService';
import { findUserIdByEmail } from '@/lib/services/userLookup';
import { getAppBaseUrl } from '@/lib/communications/links';
import { buildInvitationUrl, sendInvitationEmail, INVITATION_TTL_HOURS } from '@/lib/communications/email/invitations';

export const runtime = 'nodejs';

/**
 * TEAM INVITATIONS — /api/clinic/invitations (#38)
 *
 * POST : owner/manager invites an email → row + email with the acceptance link.
 * GET  : owner/manager lists the clinic's PENDING invitations.
 * DELETE (revoke) lives in ./[id]/route.ts.
 *
 * The invitation token is NEVER logged and never returned by GET. POST returns
 * it once (to the authorizing admin) so the link can be shared manually when
 * email delivery is unavailable.
 *
 * `owner` is deliberately NOT invitable: letting a manager mint a co-owner would
 * be a privilege escalation. Ownership transfers stay an explicit action.
 */
const INVITABLE_ROLES = ['manager', 'doctor', 'receptionist', 'staff'] as const;

/**
 * Link lifetime — 24 hours (20261017). The value is shared with the DB default
 * and the email copy so the three can never drift apart.
 */
const LINK_TTL_HOURS = INVITATION_TTL_HOURS;
const createSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  role: z.enum(INVITABLE_ROLES).optional().default('staff'),
});

function unauthorized(status: 401 | 403) {
  return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const clinicId = url.searchParams.get('clinic_id');
  if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

  const authorization = await authorizeClinicRequest(req, clinicId);
  if (!authorization.authorized) return unauthorized(authorization.status);
  if (roleDenied(authorization, ADMIN_ROLES)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid payload' }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const role = parsed.data.role;

  // Self-invite is meaningless (the admin is already a member).
  if ((authorization.user.email ?? '').trim().toLowerCase() === email) {
    return NextResponse.json({ error: 'أنت عضو في هذه العيادة بالفعل' }, { status: 409 });
  }

  const { data: clinic } = await supabaseAdmin
    .from('clinics')
    .select('id, name, slug')
    .eq('id', clinicId)
    .maybeSingle();
  if (!clinic) return NextResponse.json({ error: 'العيادة غير موجودة' }, { status: 404 });

  // Already an ACTIVE member? Then there is nothing to invite.
  const existingUserId = await findUserIdByEmail(email);
  if (existingUserId) {
    const { data: membership } = await supabaseAdmin
      .from('clinic_users')
      .select('id, deleted_at')
      .eq('clinic_id', clinicId)
      .eq('user_id', existingUserId)
      .maybeSingle();
    if (membership && membership.deleted_at === null) {
      return NextResponse.json({ error: 'هذا البريد عضو بالفعل في هذه العيادة' }, { status: 409 });
    }
  }

  // One pending invitation per email per clinic (partial unique index backs this).
  const { data: pending } = await supabaseAdmin
    .from('invitations')
    .select('id, expires_at')
    .eq('clinic_id', clinicId)
    .eq('invited_email', email)
    .eq('status', 'pending')
    .maybeSingle();
  if (pending) {
    return NextResponse.json(
      { error: 'توجد دعوة معلقة لهذا البريد. ألغِها أو انتظر انتهاء صلاحيتها ثم أعد الإرسال.' },
      { status: 409 }
    );
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + LINK_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const { data: invitation, error } = await supabaseAdmin
    .from('invitations')
    .insert({
      clinic_id: clinicId,
      invited_email: email,
      role,
      token,
      status: 'pending',
      expires_at: expiresAt,
      invited_by: authorization.user.id,
    })
    .select('id, clinic_id, invited_email, role, status, expires_at, created_at')
    .single();

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return NextResponse.json({ error: 'توجد دعوة معلقة لهذا البريد' }, { status: 409 });
    }
    logEvent('team_invitation_create_error', { clinic_id: clinicId, error: error.message, code: error.code }, 'error');
    return NextResponse.json(
      { error: 'تعذر إنشاء الدعوة', detail: `${error.code ?? ''} ${error.message}`.trim() },
      { status: 500 }
    );
  }

  const inviteUrl = buildInvitationUrl(getAppBaseUrl(), token);

  // Best-effort delivery, but HONEST: a mail outage (or an unconfigured
  // provider) must not lose the invitation — the caller always receives the
  // link, and `email_sent: false` tells the UI to surface it for copying.
  const delivery = await sendInvitationEmail({
    to: email,
    clinicName: clinic.name,
    invitedBy: authorization.user.email ?? null,
    role,
    token,
    expiresIn: `${LINK_TTL_HOURS} ساعة`,
  });
  const emailSent = delivery.sent;
  const emailError = delivery.error;

  await writeAuditLog({
    clinicId,
    actorUserId: authorization.user.id,
    action: 'invitation.create',
    resourceType: 'invitation',
    resourceId: invitation.id,
    metadata: { email, role, email_sent: emailSent, email_provider: delivery.provider },
  });

  logEvent('team_invitation_created', {
    clinic_id: clinicId,
    invitation_id: invitation.id,
    role,
    email_sent: emailSent,
    email_provider: delivery.provider,
  });

  return NextResponse.json(
    {
      invitation,
      invite_url: inviteUrl,
      email_sent: emailSent,
      email_provider: delivery.provider,
      email_error: emailError,
      expires_in_hours: LINK_TTL_HOURS,
    },
    { status: 201 }
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clinicId = url.searchParams.get('clinic_id');
  if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

  const authorization = await authorizeClinicRequest(req, clinicId);
  if (!authorization.authorized) return unauthorized(authorization.status);
  if (roleDenied(authorization, ADMIN_ROLES)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now = Date.now();
  const mapRows = (rows: Record<string, unknown>[] | null) =>
    (rows ?? []).map((row) => {
      const expiresAt = new Date(String(row.expires_at)).getTime();
      const sessionExpiresAt = row.session_expires_at ? new Date(String(row.session_expires_at)).getTime() : null;
      return {
        ...row,
        is_expired: expiresAt <= now,
        // The invitee has the page open right now (30-minute session, 20261017).
        session_active: sessionExpiresAt !== null && sessionExpiresAt > now,
        hours_left: Math.max(0, Math.round(((expiresAt - now) / (1000 * 60 * 60)) * 10) / 10),
      };
    });

  // The token is intentionally NOT selected — the list must never expose it.
  const listed = await supabaseAdmin
    .from('invitations')
    .select(
      'id, invited_email, role, status, expires_at, accepted_at, created_at, opened_at, session_expires_at, extend_count, accept_count'
    )
    .eq('clinic_id', clinicId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  let data = listed.data as Record<string, unknown>[] | null;
  let error = listed.error;

  // Pre-20261017 schema (code deployed before the SQL): the new columns do not
  // exist yet, so fall back to the legacy projection instead of 500ing the list.
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    logEvent('team_invitation_list_legacy_projection', {
      clinic_id: clinicId,
      hint: 'apply migration 20261017_invitation_security.sql',
    });
    const legacy = await supabaseAdmin
      .from('invitations')
      .select('id, invited_email, role, status, expires_at, accepted_at, created_at')
      .eq('clinic_id', clinicId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    data = legacy.data as Record<string, unknown>[] | null;
    error = legacy.error;
  }

  if (error) {
    logEvent('team_invitation_list_error', { clinic_id: clinicId, error: error.message, code: error.code }, 'error');
    return NextResponse.json(
      { error: 'تعذر جلب الدعوات', detail: `${error.code ?? ''} ${error.message}`.trim() },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: mapRows(data) });
}
