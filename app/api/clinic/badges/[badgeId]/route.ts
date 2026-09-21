import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeClinicRequest,
  roleDenied,
  ADMIN_ROLES,
} from '@/lib/services/clinicAuthorization';
import { updateClinicBadge, deleteClinicBadge } from '@/lib/services/clinicBadges';
import { writeAuditLog } from '@/lib/services/auditService';

const patchSchema = z.object({
  type: z.enum(['certification', 'award', 'membership', 'achievement']).optional(),
  title: z.string().trim().max(200).nullable().optional(),
  issuer: z.string().trim().max(200).nullable().optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  icon_url: z.string().url().startsWith('https://').max(600).nullable().optional(),
  verify_url: z.string().url().startsWith('https://').max(600).nullable().optional(),
  enabled: z.boolean().optional(),
  display_order: z.number().int().min(0).max(999).optional(),
});

type Ctx = { params: { badgeId: string } };

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

    const result = await updateClinicBadge(clinicId, params.badgeId, parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });

    await writeAuditLog({
      clinicId,
      actorUserId: authorization.user?.id ?? null,
      action: 'clinic.badge.update',
      resourceType: 'clinic',
      resourceId: clinicId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Internal error', detail: message }, { status: 500 });
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

    const result = await deleteClinicBadge(clinicId, params.badgeId);
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });

    await writeAuditLog({
      clinicId,
      actorUserId: authorization.user?.id ?? null,
      action: 'clinic.badge.delete',
      resourceType: 'clinic',
      resourceId: clinicId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Internal error', detail: message }, { status: 500 });
  }
}