import { NextResponse } from 'next/server';
import { authorizeClinicRequest, CASH_SESSION_OPEN_ROLES, FINANCE_READ_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { openCashSession, listCashSessions } from '@/lib/services/accounting';

// Accounting Phase C — cash register sessions. POST = open, GET = list.
// Only ONE open session per clinic is physically possible (partial unique
// index); a second open attempt maps to 409.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.clinic_id) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const authorization = await authorizeClinicRequest(req, body.clinic_id);
    const permission = await permissionDenied(req, body.clinic_id, 'manage_payments', { allowedRoles: CASH_SESSION_OPEN_ROLES });
    if (permission) return permission;

    const data = await openCashSession({
      clinicId: body.clinic_id,
      openingAmount: body.opening_amount ?? 0,
      actorUserId: authorization.user?.id ?? null,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /CASH_OPENING_INVALID/.test(message)
      ? 400
      : /CASH_SESSION_ALREADY_OPEN|duplicate key|unique constraint/i.test(message)
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const permission = await permissionDenied(req, clinicId, 'view_financial', { allowedRoles: FINANCE_READ_ROLES });
    if (permission) return permission;
    const data = await listCashSessions(clinicId);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
