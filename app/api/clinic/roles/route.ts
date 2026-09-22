import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isPermissionKey } from '@/lib/auth/permissions';
import { writeAuditLog } from '@/lib/services/auditService';

export const runtime = 'nodejs';

// #43 — clinic-defined custom roles.
// GET  ?clinic_id=… → list the clinic's custom roles.
// POST { clinic_id, name, permissions[], … } → create one (owner/manager only).

const RESERVED_ROLE_NAMES = ['owner', 'manager', 'doctor', 'receptionist', 'accountant', 'staff'];

const createSchema = z.object({
  clinic_id: z.string().uuid(),
  name: z.string().trim().min(2, 'اسم الدور قصير جدًا').max(50),
  description: z.string().max(300).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'لون غير صالح').optional(),
  permissions: z.array(z.string()).optional().default([]),
});

export async function GET(req: Request) {
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

  const { data, error } = await supabaseAdmin
    .from('custom_roles')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('name');

  if (error) {
    return NextResponse.json({ error: 'تعذر جلب الأدوار' }, { status: 500 });
  }
  return NextResponse.json({ roles: data ?? [] });
}

export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid payload' }, { status: 400 });
  }
  const { clinic_id: clinicId, name, description, color, permissions } = parsed.data;

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

  if (RESERVED_ROLE_NAMES.includes(name.toLowerCase())) {
    return NextResponse.json({ error: 'هذا الاسم محجوز للأدوار الأساسية' }, { status: 400 });
  }

  // Unknown permission keys are rejected rather than silently dropped.
  const unknown = permissions.filter((p) => !isPermissionKey(p));
  if (unknown.length > 0) {
    return NextResponse.json({ error: `صلاحيات غير معروفة: ${unknown.join(', ')}` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('custom_roles')
    .insert({
      clinic_id: clinicId,
      name,
      description: description ?? null,
      permissions,
      color: color ?? '#10b981',
      created_by: authorization.user.id,
    })
    .select()
    .single();

  if (error) {
    if (/duplicate key/i.test(error.message)) {
      return NextResponse.json({ error: 'يوجد دور بهذا الاسم بالفعل' }, { status: 409 });
    }
    return NextResponse.json({ error: 'تعذر إنشاء الدور', detail: error.message }, { status: 500 });
  }

  await writeAuditLog({
    clinicId,
    actorUserId: authorization.user.id,
    action: 'role.create',
    resourceType: 'custom_role',
    resourceId: data.id,
    metadata: { name, permission_count: permissions.length },
  });

  return NextResponse.json({ role: data }, { status: 201 });
}
