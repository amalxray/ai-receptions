import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { writeAuditLog } from '@/lib/services/auditService';
import { findUserIdByEmail, maskEmail } from '@/lib/services/userLookup';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { INVITATION_ROLE_AR, INVITATION_SESSION_MINUTES } from '@/lib/communications/email/invitations';
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
 * Single-use + 24h link expiry + 30-minute opening session + email binding +
 * users-entitlement gate (the plan limit is enforced AT ACCEPT time, which is
 * when the membership is created).
 *
 * The authoritative guards live in the database (migration 20261017):
 *   - GET  → rpc open_invitation   (starts/reuses the 30-min session)
 *   - POST → rpc accept_invitation (SELECT … FOR UPDATE + status/expiry/email
 *            checks + accept_count++, so two racing accepts cannot both win)
 * The checks below only produce friendlier Arabic errors; they never replace the
 * RPC verdict.
 */
const ACCEPTABLE_ROLES = ['owner', 'admin', 'manager', 'doctor', 'receptionist', 'accountant', 'staff', 'viewer'] as const;

/** Mapping of the SQL exception codes raised by the 20261017 functions. */
const INVITATION_SQL_ERRORS: Record<string, { status: number; error: string }> = {
  INVITATION_NOT_FOUND: { status: 404, error: 'الدعوة غير موجودة' },
  ALREADY_ACCEPTED: { status: 409, error: 'تم استخدام هذه الدعوة بالفعل' },
  INVITATION_INVALID: { status: 410, error: 'تم إلغاء هذه الدعوة' },
  INVITATION_EXPIRED: { status: 410, error: 'انتهت صلاحية هذه الدعوة' },
  EMAIL_MISMATCH: { status: 403, error: 'هذه الدعوة مرتبطة ببريد آخر' },
  USER_NOT_FOUND: { status: 401, error: 'جلسة غير صالحة' },
  Unauthorized: { status: 403, error: 'Forbidden' },
  NOT_PENDING: { status: 409, error: 'الدعوة لم تعد معلقة' },
  MAX_EXTENDS_REACHED: { status: 409, error: 'تم الوصول للحد الأقصى من التمديدات' },
};

/** Translates a PostgREST/plpgsql error into an HTTP response descriptor. */
function describeInvitationSqlError(message: string | undefined): { status: number; error: string } {
  const code = (message ?? '').trim();
  return INVITATION_SQL_ERRORS[code] ?? { status: 500, error: 'تعذر إكمال العملية' };
}

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
  /** 30-minute opening session started by `open_invitation` (20261017). */
  session_expires_at?: string | null;
};

/**
 * Two projections: the full one and the pre-20261017 one. Deploying this code
 * before the SQL must not break the invite page, so a missing-column error
 * (42703 / PGRST204) falls back to the legacy projection instead of 500ing.
 */
const INVITATION_COLUMNS = 'id, clinic_id, invited_email, role, status, expires_at, accepted_at, session_expires_at';
const INVITATION_COLUMNS_LEGACY = 'id, clinic_id, invited_email, role, status, expires_at, accepted_at';

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /column .* does not exist/i.test(error.message ?? '');
}

async function loadInvitationByToken(token: string): Promise<InvitationRow | null> {
  const read = (columns: string) =>
    supabaseAdmin.from('invitations').select(columns).eq('token', token).maybeSingle();

  let { data, error } = await read(INVITATION_COLUMNS);
  if (isMissingColumn(error)) {
    logEvent('invitation_lookup_legacy_projection', { hint: 'apply migration 20261017_invitation_security.sql' });
    ({ data, error } = await read(INVITATION_COLUMNS_LEGACY));
  }

  if (error) {
    logEvent('invitation_lookup_error', { error: error.message, code: error.code }, 'error');
    return null;
  }
  if (!data) return null;
  // `unknown` hop: a dynamic column string makes supabase-js type `data` as a
  // union that includes GenericStringError, which is not a row shape.
  const row = data as unknown as InvitationRow;
  return { ...row, session_expires_at: row.session_expires_at ?? null };
}

function isExpired(invitation: InvitationRow): boolean {
  return new Date(invitation.expires_at).getTime() <= Date.now();
}

async function loadClinic(clinicId: string) {
  const { data } = await supabaseAdmin.from('clinics').select('id, name, slug').eq('id', clinicId).maybeSingle();
  return data as { id: string; name: string; slug: string } | null;
}

/**
 * Starts (or reuses) the 30-minute opening session for a token.
 * Never throws: a preview must still render when the RPC refuses (expired,
 * revoked, accepted) — the caller falls back to the locally computed status.
 */
async function startOpeningSession(token: string): Promise<{ validUntil: string | null; reopened: boolean }> {
  const { data, error } = await supabaseAdmin.rpc('open_invitation', { p_token: token });
  if (error) {
    logEvent(
      'invitation_session_error',
      { error: error.message, code: error.code, missing_function: isMissingInvitationFunction(error) },
      'error'
    );
    return { validUntil: null, reopened: false };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    validUntil: (row?.session_valid_until as string | null) ?? null,
    reopened: Boolean(row?.was_reopened),
  };
}

/** True when PostgREST cannot see the 20261017 function at all. */
function isMissingInvitationFunction(error: { code?: string; message?: string }): boolean {
  const code = error?.code ?? '';
  if (code === 'PGRST202' || code === '42883') return true;
  return /could not find the function|function .* does not exist/i.test(error?.message ?? '');
}

/**
 * Legacy single-use gate, used ONLY while migration 20261017 is not deployed.
 *
 * The `status = pending` predicate is evaluated by the database, so exactly one
 * of two racing accepts can match — the same guarantee the RPC provides. The
 * first attempt keeps the new CHECK constraint satisfied (`accepted` requires
 * accept_count >= 1); if the column does not exist yet we retry with the
 * pre-migration payload.
 */
async function consumeInvitationLegacy(
  token: string,
  userId: string
): Promise<{ status: number; error: string } | null> {
  const base = { status: 'accepted', accepted_by: userId, accepted_at: new Date().toISOString() };

  for (const payload of [{ ...base, accept_count: 1 }, base]) {
    const { data, error } = await supabaseAdmin
      .from('invitations')
      .update(payload)
      .eq('token', token)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (data) return null;
    if (!error) return { status: 409, error: 'تم استخدام هذه الدعوة بالفعل' };
    if (error.code !== '42703') {
      logEvent('invitation_legacy_consume_error', { error: error.message, code: error.code }, 'error');
      return { status: 500, error: 'تعذر إكمال العملية' };
    }
    // 42703 = accept_count is unknown → pre-migration schema, retry below.
  }

  return { status: 500, error: 'تعذر إكمال العملية' };
}

/**
 * Consumes the invitation atomically. Returns null on success, else an HTTP error.
 *
 * Primary path: `accept_invitation` (row lock + status/expiry/mailbox re-check in
 * one transaction). If that function is not deployed yet the legacy guarded
 * UPDATE takes over, so deploying this code before the SQL can never break
 * joining — it only loses the DB-side extras.
 */
async function consumeInvitation(token: string, userId: string): Promise<{ status: number; error: string } | null> {
  const { error } = await supabaseAdmin.rpc('accept_invitation', { p_token: token, p_user_id: userId });
  if (!error) return null;

  if (isMissingInvitationFunction(error)) {
    logEvent(
      'invitation_rpc_missing_fallback',
      { rpc: 'accept_invitation', code: error.code, hint: 'apply migration 20261017_invitation_security.sql' },
      'error'
    );
    return consumeInvitationLegacy(token, userId);
  }

  return describeInvitationSqlError(error.message);
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

  // Opening the link starts a 30-minute session (20261017). Only a pending,
  // unexpired invitation gets one — the RPC enforces that and we degrade
  // gracefully to a sessionless preview when it refuses.
  const session =
    invitation.status === 'pending' && !expired
      ? await startOpeningSession(token)
      : { validUntil: null as string | null, reopened: false };

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
      // Session metadata for the 30-minute countdown. The countdown is advisory
      // UX only — the DB clock is the one that decides.
      session_valid_until: session.validUntil,
      session_minutes: INVITATION_SESSION_MINUTES,
      session_reopened: session.reopened,
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
  // A refusal (race, revoked, expired) is not fatal: they are a member already,
  // so they get in regardless — we only log why the row was not consumed.
  if (existingMembership && existingMembership.deleted_at === null) {
    const consumeError = await consumeInvitation(token, userId);
    if (consumeError) {
      logEvent('invitation_consume_skipped', {
        invitation_id: invitation.id,
        reason: consumeError.error,
      });
    }
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

  // Consume the invitation — the DB function takes a row lock (SELECT … FOR
  // UPDATE) and re-verifies status + expiry + mailbox, so two racing accepts can
  // never both win: the loser gets ALREADY_ACCEPTED and everything this request
  // created is compensated away below.
  const consumeError = await consumeInvitation(token, userId);

  if (consumeError) {
    if (!existingMembership && membershipId) {
      const { error: deleteError } = await supabaseAdmin.from('clinic_users').delete().eq('id', membershipId);
      if (deleteError) {
        logEvent(
          'invitation_membership_rollback_failed',
          { invitation_id: invitation.id, error: deleteError.message },
          'error'
        );
      }
    }
    await releaseEntitlement(invitation.clinic_id, 'users');
    await rollbackCreatedUser('race_lost');
    logEvent(
      'invitation_consume_failed',
      { invitation_id: invitation.id, status: consumeError.status, reason: consumeError.error },
      'error'
    );
    return NextResponse.json({ error: consumeError.error }, { status: consumeError.status });
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

