import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { writeAuditLog } from '@/lib/services/auditService';

export const runtime = 'nodejs';

/**
 * EXTEND a pending invitation (#38 / migration 20261017).
 *
 * POST /api/clinic/invitations/{id}/extend?clinic_id=…
 * Body: { hours?: 24 }
 *
 * Ownership is enforced twice:
 *   1. the route requires an authorized admin session on this clinic
 *      (ADMIN_ROLES = owner/manager — a doctor or receptionist gets 403);
 *   2. `extend_invitation` re-checks the actor's role INSIDE the transaction, so
 *      a stale/forged request cannot extend by calling PostgREST directly.
 *
 * Guards (all in SQL, atomic): status must be 'pending', at most 3 extensions,
 * and the new expiry is computed from max(current expiry, now) — an invitation
 * that just lapsed gets a full window instead of a timestamp in the past.
 */
const extendSchema = z.object({
  hours: z.number().int().min(1).max(24).optional(),
});

/** Cap enforced in SQL too — this constant only feeds the UI/payload. */
const MAX_EXTENSIONS = 3;

const SQL_ERROR_STATUS: Record<string, { status: number; error: string }> = {
  INVITATION_NOT_FOUND: { status: 404, error: 'الدعوة غير موجودة' },
  NOT_PENDING: { status: 409, error: 'لا يمكن تمديد دعوة مقبولة أو ملغاة' },
  MAX_EXTENDS_REACHED: { status: 409, error: 'تم الوصول للحد الأقصى من التمديدات (3)' },
  Unauthorized: { status: 403, error: 'Forbidden' },
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const clinicId = url.searchParams.get('clinic_id');
  if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

  const authorization = await authorizeClinicRequest(req, clinicId);
  if (!authorization.authorized) {
    return NextResponse.json(
      { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: authorization.status }
    );
  }
  if (roleDenied(authorization, ADMIN_ROLES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // A malformed body must not block a legitimate extension → default to 24h.
  const parsed = extendSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'بيانات غير صالحة' }, { status: 400 });
  }
  const hours = parsed.data.hours ?? 24;

  const { data, error } = await supabaseAdmin.rpc('extend_invitation', {
    p_invitation_id: params.id,
    p_clinic_id: clinicId,
    p_actor_user_id: authorization.user.id,
    p_hours: hours,
    p_max_extends: MAX_EXTENSIONS,
  });

  if (error) {
    // Deploy order: the RPC ships with migration 20261017 — until it is applied
    // the feature is simply unavailable, which must read as 503, not 500.
    const missing = error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? '');
    if (missing) {
      logEvent(
        'team_invitation_extend_unavailable',
        { clinic_id: clinicId, hint: 'apply migration 20261017_invitation_security.sql' },
        'error'
      );
      return NextResponse.json(
        { error: 'التمديد غير متاح بعد — يجب تطبيق تحديث قاعدة البيانات (20261017).', detail: 'RPC_NOT_DEPLOYED' },
        { status: 503 }
      );
    }

    const mapped = SQL_ERROR_STATUS[(error.message ?? '').trim()] ?? {
      status: 500,
      error: 'تعذر تمديد الدعوة',
    };
    logEvent(
      'team_invitation_extend_error',
      { clinic_id: clinicId, invitation_id: params.id, status: mapped.status, error: error.message },
      'error'
    );
    return NextResponse.json({ error: mapped.error, detail: error.message }, { status: mapped.status });
  }

  const row = Array.isArray(data) ? data[0] : data;
  const result = {
    id: (row?.id as string) ?? params.id,
    expires_at: (row?.expires_at as string) ?? null,
    extend_count: (row?.extend_count as number) ?? null,
    status: (row?.status as string) ?? 'pending',
    max_extensions: MAX_EXTENSIONS,
  };

  await writeAuditLog({
    clinicId,
    actorUserId: authorization.user.id,
    action: 'invitation.extend',
    resourceType: 'invitation',
    resourceId: result.id,
    metadata: { hours, extend_count: result.extend_count, expires_at: result.expires_at },
  });

  logEvent('team_invitation_extended', {
    clinic_id: clinicId,
    invitation_id: result.id,
    hours,
    extend_count: result.extend_count,
  });

  return NextResponse.json({ data: result });
}
