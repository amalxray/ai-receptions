import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { writeAuditLog } from '@/lib/services/auditService';
import { findUserIdByEmail } from '@/lib/services/userLookup';
import { getAppBaseUrl } from '@/lib/communications/links';
import { buildInvitationUrl, sendInvitationEmail } from '@/lib/communications/email/invitations';

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

const INVITATION_TTL_DAYS = 7;

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
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

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
    logEvent('team_invitation_create_error', { clinic_id: clinicId, error: error.message }, 'error');
    return NextResponse.json({ error: 'تعذر إنشاء الدعوة' }, { status: 500 });
  }

  const inviteUrl = buildInvitationUrl(getAppBaseUrl(), token);

  // Best-effort delivery: a mail outage must not lose the invitation — the
  // caller still receives the link and can share it manually.
  let emailSent = false;
  try {
    await sendInvitationEmail({
      to: email,
      clinicName: clinic.name,
      invitedBy: authorization.user.email ?? null,
      role,
      token,
      expiresIn: '7 أيام',
    });
    emailSent = true;
  } catch (err) {
    logEvent(
      'team_invitation_email_error',
      {
        clinic_id: clinicId,
        invitation_id: invitation.id,
        error: err instanceof Error ? err.message : String(err),
      },
      'error'
    );
  }

  await writeAuditLog({
    clinicId,
    actorUserId: authorization.user.id,
    action: 'invitation.create',
    resourceType: 'invitation',
    resourceId: invitation.id,
    metadata: { email, role, email_sent: emailSent },
  });

  logEvent('team_invitation_created', {
    clinic_id: clinicId,
    invitation_id: invitation.id,
    role,
    email_sent: emailSent,
  });

  return NextResponse.json({ invitation, invite_url: inviteUrl, email_sent: emailSent }, { status: 201 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clinicId = url.searchParams.get('clinic_id');
  if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

  const authorization = await authorizeClinicRequest(req, clinicId);
  if (!authorization.authorized) return unauthorized(authorization.status);
  if (roleDenied(authorization, ADMIN_ROLES)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('invitations')
    // The token is intentionally NOT selected — the list must never expose it.
    .select('id, invited_email, role, status, expires_at, accepted_at, created_at')
    .eq('clinic_id', clinicId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    logEvent('team_invitation_list_error', { clinic_id: clinicId, error: error.message }, 'error');
    return NextResponse.json({ error: 'تعذر جلب الدعوات' }, { status: 500 });
  }

  const now = Date.now();
  const invitations = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    is_expired: new Date(String(row.expires_at)).getTime() <= now,
  }));

  return NextResponse.json({ data: invitations });
}
