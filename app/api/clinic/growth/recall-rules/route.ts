import { NextResponse } from 'next/server';
import { authorizeClinicRequest, DATA_ROLES, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { createRecallRule, listRecallRules } from '@/lib/services/growth';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const permBlocked = await permissionDenied(req, clinicId, 'view_growth', { allowedRoles: DATA_ROLES });
    if (permBlocked) return permBlocked;
    const data = await listRecallRules(clinicId);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.clinic_id) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const authorization = await authorizeClinicRequest(req, body.clinic_id);
    const permBlocked = await permissionDenied(req, body.clinic_id, 'manage_leads', { allowedRoles: ADMIN_ROLES });
    if (permBlocked) return permBlocked;

    const serviceId = body.service_id ?? null;
    const recallAfterDays = Number(body.recall_after_days);
    if (!Number.isInteger(recallAfterDays) || recallAfterDays < 1 || recallAfterDays > 3650) {
      return NextResponse.json({ error: 'recall_after_days must be an integer between 1 and 3650' }, { status: 400 });
    }

    const data = await createRecallRule({
      clinicId: body.clinic_id,
      serviceId,
      recallAfterDays,
      enabled: body.enabled !== false,
      actorUserId: authorization.user?.id ?? null,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /duplicate/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}