import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPermissionKey } from '@/lib/auth/permissions';
import { writeAuditLog } from '@/lib/services/auditService';

export const runtime = 'nodejs';

// #43 — manage a single custom role: PATCH (rename/recolor/permissions),
// DELETE (only when no active member still uses it as their role).

const patchSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  description: z.string().max(300).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  permissions: z.array(z.string()).optional(),
});

const RESERVED_ROLE_NAMES = ['owner', 'manager', 'doctor', 'receptionist', 'accountant', 'staff'];

export async function PATCH(
  req: Request,
  { params }: { params: { roleId: string } }
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid payload' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) {
    if (RESERVED_ROLE_NAMES.includes(parsed.data.name.toLowerCase())) {
      return NextResponse.json({ error: 'هذا الاسم محجوز للأدوار الأساسية' }, { status: 400 });
    }
    updates.name = parsed.data.name;
  }
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.permissions !== undefined) {
    const unknown = parsed.data.permissions.filter((p) => !isPermissionKey(p));
    if (unknown.length > 0) {
      return NextResponse.json({ error: `صلاحيات غير معروفة: ${unknown.join(', ')}` }, { status: 400 });
    }
    updates.permissions = parsed.data.permissions;
  }

  const { data, error } = await supabaseAdmin
    .from('custom_roles')
    .update(updates)
    .eq('id', params.roleId)
    .eq('clinic_id', clinicId)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'الدور غير موجود أو تعذر تعديله' }, { status: error?.message?.includes('duplicate') ? 409 : 404 });
  }

  await writeAuditLog({
    clinicId,
    actorUserId: authorization.user.id,
    action: 'role.update',
    resourceType: 'custom_role',
    resourceId: params.roleId,
    metadata: updates,
  });

  return NextResponse.json({ role: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: { roleId: string } }
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
  if (roleDenied(authorization, ADMIN_ROLES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: role } = await supabaseAdmin
    .from('custom_roles')
    .select('id, name, is_system')
    .eq('id', params.roleId)
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (!role) return NextResponse.json({ error: 'الدور غير موجود' }, { status: 404 });
  if (role.is_system) {
    return NextResponse.json({ error: 'لا يمكن حذف دور نظامي' }, { status: 400 });
  }

  // Refuse deletion while active members still carry this role name.
  const { count } = await supabaseAdmin
    .from('clinic_users')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('role', role.name)
    .is('deleted_at', null);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `لا يمكن الحذف — ${count} عضو يستخدم هذا الدور`, in_use: count },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from('custom_roles')
    .delete()
    .eq('id', params.roleId)
    .eq('clinic_id', clinicId);

  if (error) {
    return NextResponse.json({ error: 'تعذر حذف الدور', detail: error.message }, { status: 500 });
  }

  await writeAuditLog({
    clinicId,
    actorUserId: authorization.user.id,
    action: 'role.delete',
    resourceType: 'custom_role',
    resourceId: params.roleId,
    metadata: { name: role.name },
  });

  return NextResponse.json({ success: true });
}
