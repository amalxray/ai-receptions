import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeClinicRequest,
  roleDenied,
  ADMIN_ROLES,
} from '@/lib/services/clinicAuthorization';
import { updateClinicBeforeAfter, deleteClinicBeforeAfter } from '@/lib/services/clinicBeforeAfter';
import { writeAuditLog } from '@/lib/services/auditService';

const patchSchema = z.object({
  title: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  enabled: z.boolean().optional(),
  display_order: z.number().int().min(0).max(999).optional(),
});

type Ctx = { params: { caseId: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized || roleDenied(authorization, ADMIN_ROLES)) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    const result = await updateClinicBeforeAfter(clinicId, params.caseId, parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.message === 'Case not found' ? 404 : 400 });

    await writeAuditLog({
      clinicId,
      actorUserId: authorization.user?.id ?? null,
      action: 'clinic.before_after.update',
      resourceType: 'clinic',
      resourceId: clinicId,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized || roleDenied(authorization, ADMIN_ROLES)) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }

    const result = await deleteClinicBeforeAfter(clinicId, params.caseId);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.message === 'Case not found' ? 404 : 400 });

    await writeAuditLog({
      clinicId,
      actorUserId: authorization.user?.id ?? null,
      action: 'clinic.before_after.delete',
      resourceType: 'clinic',
      resourceId: clinicId,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}