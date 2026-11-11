import { NextResponse } from 'next/server';
import { authorizeClinicRequest, DATA_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { dismissRecall } from '@/lib/services/growth';

export async function POST(req: Request, context: { params: { recallId: string } }) {
  try {
    const body = await req.json();
    const clinicId = body?.clinic_id;
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const authorization = await authorizeClinicRequest(req, clinicId);
    const permBlocked = await permissionDenied(req, clinicId, 'view_growth', { allowedRoles: DATA_ROLES });
    if (permBlocked) return permBlocked;
    await dismissRecall({ clinicId, recallId: context.params.recallId, actorUserId: authorization.user?.id ?? null });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}