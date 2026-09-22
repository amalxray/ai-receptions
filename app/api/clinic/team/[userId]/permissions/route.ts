import { NextResponse } from 'next/server';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { clearPermissionCache, isPermissionKey } from '@/lib/auth/permissions';
import { writeAuditLog } from '@/lib/services/auditService';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';

// #43 — per-user permission overrides.
// GET  ?clinic_id=… → the member's override rows.
// POST { clinic_id, permissions } → atomic replace via set_user_permissions().

export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
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

  // A member may read their OWN overrides; only admins read others'.
  if (params.userId !== authorization.user.id) {
    if (roleDenied(authorization, ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('user_permissions')
    .select('permission_key, enabled, updated_at')
    .eq('user_id', params.userId)
    .eq('clinic_id', clinicId);

  if (error) {
    return NextResponse.json({ error: 'تعذر جلب الصلاحيات' }, { status: 500 });
  }
  return NextResponse.json({ overrides: data ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: { userId: string } }
) {
  const body = await req.json().catch(() => null);
  const clinicId = body?.clinic_id;
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

  // Validate the payload: { permission_key: boolean } with known keys only.
  const permissions = body?.permissions;
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  for (const key of Object.keys(permissions)) {
    if (!isPermissionKey(key) || typeof permissions[key] !== 'boolean') {
      return NextResponse.json({ error: `صلاحية غير معروفة: ${key}` }, { status: 400 });
    }
  }

  // Target must be an active member of this clinic.
  const { data: target } = await supabaseAdmin
    .from('clinic_users')
    .select('id, role, deleted_at')
    .eq('user_id', params.userId)
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'العضو غير موجود في هذه العيادة' }, { status: 404 });
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'لا يمكن تعديل صلاحيات المالك' }, { status: 400 });
  }

  // A manager may not touch another manager's permissions.
  if (authorization.role === 'manager' && target.role === 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error: rpcError } = await supabaseAdmin.rpc('set_user_permissions', {
    // The actor is the AUTHENTICATED admin this route already verified — the
    // function authorizes this explicit id (auth.uid() is NULL under the
    // service-role client, which made the previous variant fail with P0001).
    p_actor_user_id: authorization.user.id,
    p_user_id: params.userId,
    p_clinic_id: clinicId,
    p_permissions: permissions,
  });

  if (rpcError) {
    if (/CANNOT_MODIFY_OWNER/.test(rpcError.message)) {
      return NextResponse.json({ error: 'لا يمكن تعديل صلاحيات المالك' }, { status: 400 });
    }
    if (/TARGET_NOT_MEMBER/.test(rpcError.message)) {
      return NextResponse.json({ error: 'العضو غير موجود في هذه العيادة' }, { status: 404 });
    }
    if (/Unauthorized/.test(rpcError.message)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // PGRST202 = PostgREST could not find the 4-arg function → the actor-aware
    // migration never landed in this database (the retired 3-arg overload may
    // still be there). 20261015 is idempotent and drops every old overload.
    if (rpcError.code === 'PGRST202' || /Could not find the function/i.test(rpcError.message)) {
      logEvent('permissions_rpc_migration_missing', { clinic_id: clinicId, code: rpcError.code }, 'error');
      return NextResponse.json(
        {
          error: 'PERMISSIONS_MIGRATION_REQUIRED',
          message: 'طبّق الترحيل db/migrations/20261015_fix_set_user_permissions.sql لتفعيل الحفظ.',
          detail: `${rpcError.code ?? ''} ${rpcError.message}`.trim(),
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'تعذر حفظ الصلاحيات', detail: `${rpcError.code ?? ''} ${rpcError.message}`.trim() },
      { status: 500 }
    );
  }

  clearPermissionCache(params.userId);

  await writeAuditLog({
    clinicId,
    actorUserId: authorization.user.id,
    action: 'member.permissions_update',
    resourceType: 'user_permissions',
    resourceId: params.userId,
    metadata: { user_id: params.userId, count: Object.keys(permissions).length },
  });

  return NextResponse.json({ success: true });
}
