import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeClinicRequest,
  roleDenied,
  ADMIN_ROLES,
  DATA_ROLES,
} from '@/lib/services/clinicAuthorization';
import { listClinicBadges, createClinicBadge } from '@/lib/services/clinicBadges';
import { logEvent } from '@/lib/server/logging';
import { writeAuditLog } from '@/lib/services/auditService';

const createSchema = z.object({
  type: z.enum(['certification', 'award', 'membership', 'achievement']),
  title: z.string().trim().min(1).max(200),
  issuer: z.string().trim().max(200).optional().nullable(),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  icon_url: z.string().url().startsWith('https://').max(600).optional().nullable(),
  verify_url: z.string().url().startsWith('https://').max(600).optional().nullable(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized || roleDenied(authorization, DATA_ROLES)) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }

    const data = await listClinicBadges(clinicId);
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('badges_get_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
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
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
        { status: 400 }
      );
    }

    const result = await createClinicBadge(clinicId, {
      type: parsed.data.type,
      title: parsed.data.title,
      issuer: parsed.data.issuer ?? undefined,
      year: parsed.data.year ?? undefined,
      icon_url: parsed.data.icon_url ?? undefined,
      verify_url: parsed.data.verify_url ?? undefined,
    });
    if (!('item' in result)) return NextResponse.json({ error: result.message }, { status: 400 });

    await writeAuditLog({
      clinicId,
      actorUserId: authorization.user?.id ?? null,
      action: 'clinic.badge.create',
      resourceType: 'clinic',
      resourceId: clinicId,
    });
    return NextResponse.json({ data: result.item }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent('badges_create_error', { error: message }, 'error');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}