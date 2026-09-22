import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { writeAuditLog } from '@/lib/services/auditService';
import { findUserIdByEmail, maskEmail } from '@/lib/services/userLookup';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { INVITATION_ROLE_AR } from '@/lib/communications/email/invitations';
import {
  assertEntitlement,
  releaseEntitlement,
  entitlementErrorResponse,
} from '@/lib/subscription/entitlements';

export const runtime = 'nodejs';

/**
 * INVITATION ACCEPTANCE — /api/invitations/accept (#38)
 *
 * GET  ?token=…  → public PREVIEW (clinic name, invited role, masked email,
 *                  status, whether an account already exists). No auth: the
 *                  256-bit token IS the credential. The full invited email and
 *                  the token are never echoed back.
 * POST { token, password? }
 *                → JOIN. Two paths:
 *                   a) caller sends a Bearer session token → must be signed in
 *                      with the invited email (bound check, case-insensitive);
 *                   b) caller sends a password → ONLY when no account exists,
 *                      an account is created for the invited email (confirmed,
 *                      so the "one click" join works without a second email
 *                      round-trip). Existing accounts can never be taken over
 *                      this way — they must sign in first.
 *
 * Single-use + 7-day expiry + email binding + users-entitlement gate (the plan
 * limit is enforced AT ACCEPT time, which is when the membership is created).
 */
const ACCEPTABLE_ROLES = ['owner', 'admin', 'manager', 'doctor', 'receptionist', 'accountant', 'staff', 'viewer'] as const;

const acceptSchema = z.object({
  token: z.string().min(32).max(200),
  password: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل').max(72).optional(),
});

type InvitationRow = {
  id: string;
  clinic_id: string;
  invited_email: string;
  role: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
};

async function loadInvitationByToken(token: string): Promise<InvitationRow | null> {
  const { data, error } = await supabaseAdmin
    .from('invitations')
    .select('id, clinic_id, invited_email, role, status, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle();
  if (error) {
    logEvent('invitation_lookup_error', { error: error.message }, 'error');
    return null;
  }
  return (data as InvitationRow | null) ?? null;
}

function isExpired(invitation: InvitationRow): boolean {
  return new Date(invitation.expires_at).getTime() <= Date.now();
}

async function loadClinic(clinicId: string) {
  const { data } = await supabaseAdmin.from('clinics').select('id, name, slug').eq('id', clinicId).maybeSingle();
  return data as { id: string; name: string; slug: string } | null;
}

export async function GET(req: Request) {
  const rl = rateLimit(clientIp(req));
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const token = new URL(req.url).searchParams.get('token')?.trim() ?? '';
  if (token.length < 32) return NextResponse.json({ error: 'رابط الدعوة غير صالح' }, { status: 400 });

  const invitation = await loadInvitationByToken(token);
  if (!invitation) return NextResponse.json({ error: 'الدعوة غير موجودة أو تم إلغاؤها' }, { status: 404 });

  const expired = isExpired(invitation);
  const status = expired && invitation.status === 'pending' ? 'expired' : invitation.status;

  const [clinic, accountUserId] = await Promise.all([
    loadClinic(invitation.clinic_id),
    invitation.status === 'pending' && !expired ? findUserIdByEmail(invitation.invited_email) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    invitation: {
      clinic_name: clinic?.name ?? 'عيادة',
      clinic_slug: clinic?.slug ?? null,
      role: invitation.role,
      role_label: INVITATION_ROLE_AR[invitation.role] ?? invitation.role,
      // Partial reveal only: enough for the invitee to recognise the mailbox.
      email_masked: maskEmail(invitation.invited_email),
      status,
      expires_at: invitation.expires_at,
      has_account: Boolean(accountUserId),
    },
  });
}

export async function POST(req: Request) {
  const rl = rateLimit(`invite-accept:${clientIp(req)}`, 30, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const parsed = acceptSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 });
  }
  const { token, password } = parsed.data;

  const invitation = await loadInvitationByToken(token);
  if (!invitation) return NextResponse.json({ error: 'الدعوة غير موجودة' }, { status: 404 });
  if (invitation.status === 'accepted') {
    return NextResponse.json({ error: 'تم استخدام هذه الدعوة بالفعل' }, { status: 409 });
  }
  if (invitation.status === 'revoked') {
    return NextResponse.json({ error: 'تم إلغاء هذه الدعوة' }, { status: 410 });
  }
  if (invitation.status === 'expired' || isExpired(invitation)) {
    if (invitation.status === 'pending') {
      await supabaseAdmin.from('invitations').update({ status: 'expired' }).eq('id', invitation.id).eq('status', 'pending');
    }
    return NextResponse.json({ error: 'انتهت صلاحية هذه الدعوة' }, { status: 410 });
  }

  const invitedEmail = invitation.invited_email.trim().toLowerCase();

  // Fail closed on a role the membership enum does not know (defends the
  // clinic_users insert against a hand-edited row).
  if (!(ACCEPTABLE_ROLES as readonly string[]).includes(invitation.role)) {
    logEvent('invitation_role_invalid', { invitation_id: invitation.id, role: invitation.role }, 'error');
    return NextResponse.json({ error: 'الدعوة تحمل دورًا غير صالح' }, { status: 400 });
  }

  // --- Resolve the joining identity ----------------------------------------
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  let joiningUserId: string | null = null;
  let createdUserId: string | null = null;

  if (bearer) {
    const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !authData.user) return NextResponse.json({ error: 'جلسة غير صالحة' }, { status: 401 });

    const sessionEmail = (authData.user.email ?? '').trim().toLowerCase();
    if (sessionEmail !== invitedEmail) {
      return NextResponse.json(
        { error: `هذه الدعوة مرتبطة بالبريد ${maskEmail(invitation.invited_email)}. سجّل الدخول بالبريد المدعو.` },
        { status: 403 }
      );
    }
    joiningUserId = authData.user.id;
  } else if (password) {
    // Password path: ONLY for a mailbox that has no account yet. An existing
    // account can never be claimed with a password chosen by the invitee.
    const existingUserId = await findUserIdByEmail(invitedEmail);
    if (existingUserId) {
      return NextResponse.json(
        { error: 'يوجد حساب بهذا البريد — سجّل الدخول أولاً ثم افتح رابط الدعوة.' },
        { status: 409 }
      );
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: invitedEmail,
      password,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      logEvent('invitation_signup_error', { invitation_id: invitation.id, error: createError?.message ?? 'no user returned' }, 'error');
      return NextResponse.json({ error: 'تعذر إنشاء الحساب. حاول مرة أخرى أو سجّل الدخول.' }, { status: 500 });
    }
    joiningUserId = created.user.id;
    createdUserId = created.user.id;
  } else {
    return NextResponse.json({ error: 'سجّل الدخول لقبول الدعوة', requires_auth: true }, { status: 401 });
  }

  const userId = joiningUserId;

  // Rollback for a freshly created account — no half-joined users are left behind.
  const rollbackCreatedUser = async (reason: string) => {
    if (!createdUserId) return;
    const { error } = await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    if (error) {
      logEvent('invitation_signup_rollback_failed', { invitation_id: invitation.id, error: error.message }, 'error');
      return;
    }
    logEvent('invitation_signup_rolled_back', { invitation_id: invitation.id, reason });
  };

  const { data: existingMembership } = await supabaseAdmin
    .from('clinic_users')
    .select('id, role, deleted_at')
    .eq('clinic_id', invitation.clinic_id)
    .eq('user_id', userId)
    .maybeSingle();

  const clinic = await loadClinic(invitation.clinic_id);

  // Already an active member → consume the invitation and let them through.
  if (existingMembership && existingMembership.deleted_at === null) {
    await supabaseAdmin
      .from('invitations')
      .update({ status: 'accepted', accepted_by: userId, accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)
      .eq('status', 'pending');
    return NextResponse.json({
      data: { clinic, role: existingMembership.role, accepted: true, created_account: Boolean(createdUserId) },
    });
  }

  // Plan limit (users) is checked where the membership becomes real.
  try {
    await assertEntitlement(invitation.clinic_id, 'users');
  } catch (err) {
    const entitlementResponse = entitlementErrorResponse(err);
    if (entitlementResponse) {
      await rollbackCreatedUser('entitlement_limit');
      return entitlementResponse;
    }
    throw err;
  }

  let membershipId: string | null = null;
  if (existingMembership) {
    // Restore a previously soft-deleted membership with the invited role.
    const { data: restored, error } = await supabaseAdmin
      .from('clinic_users')
      .update({ role: invitation.role, deleted_at: null })
      .eq('id', existingMembership.id)
      .select('id')
      .single();
    if (error || !restored) {
      await releaseEntitlement(invitation.clinic_id, 'users');
      await rollbackCreatedUser('membership_restore_failed');
      logEvent('invitation_membership_restore_error', { invitation_id: invitation.id, error: error?.message ?? 'no row' }, 'error');
      return NextResponse.json({ error: 'تعذر الانضمام إلى العيادة' }, { status: 500 });
    }
    membershipId = restored.id;
  } else {
    const { data: inserted, error } = await supabaseAdmin
      .from('clinic_users')
      .insert({ clinic_id: invitation.clinic_id, user_id: userId, role: invitation.role })
      .select('id')
      .single();
    if (error || !inserted) {
      await releaseEntitlement(invitation.clinic_id, 'users');
      await rollbackCreatedUser('membership_insert_failed');
      logEvent('invitation_membership_insert_error', { invitation_id: invitation.id, error: error?.message ?? 'no row' }, 'error');
      return NextResponse.json({ error: 'تعذر الانضمام إلى العيادة' }, { status: 500 });
    }
    membershipId = inserted.id;
  }

  // Consume the invitation — the `status = pending` guard makes this single-use
  // even when two accepts race.
  const { data: consumed } = await supabaseAdmin
    .from('invitations')
    .update({ status: 'accepted', accepted_by: userId, accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (!consumed) {
    if (!existingMembership && membershipId) {
      await supabaseAdmin.from('clinic_users').delete().eq('id', membershipId);
    }
    await releaseEntitlement(invitation.clinic_id, 'users');
    await rollbackCreatedUser('race_lost');
    return NextResponse.json({ error: 'تم استخدام هذه الدعوة بالفعل' }, { status: 409 });
  }

  await writeAuditLog({
    clinicId: invitation.clinic_id,
    actorUserId: userId,
    action: 'invitation.accept',
    resourceType: 'invitation',
    resourceId: invitation.id,
    metadata: { role: invitation.role, signup: Boolean(createdUserId) },
  });

  logEvent('team_invitation_accepted', {
    clinic_id: invitation.clinic_id,
    invitation_id: invitation.id,
    role: invitation.role,
    signup: Boolean(createdUserId),
  });

  return NextResponse.json({
    data: {
      clinic,
      role: invitation.role,
      accepted: true,
      created_account: Boolean(createdUserId),
      // Returned ONLY when THIS request created the account and proved ownership
      // by setting its password — lets the client sign in immediately (true
      // one-click join). Never returned for an existing account.
      ...(createdUserId ? { invited_email: invitedEmail } : {}),
    },
  });
}

