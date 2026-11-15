import { NextResponse } from 'next/server';
import { authorizeClinicRequest, FINANCE_ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { cancelAdvance } from '@/lib/services/payroll-engine';

// DELETE = cancel a PENDING advance (status change, never a hard delete: the
// advance history is part of payroll bookkeeping). Deducted advances cannot be
// cancelled — the DB guard rejects it.
export async function DELETE(req: Request, { params }: { params: Promise<{ advanceId: string }> }) {
  try {
    const { advanceId } = await params;
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    const permission = await permissionDenied(req, clinicId, 'manage_advances', { allowedRoles: FINANCE_ADMIN_ROLES });
    if (permission) return permission;

    const data = await cancelAdvance({ clinicId, advanceId, actorUserId: authorization.user?.id ?? null });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /ADVANCE_NOT_FOUND/.test(message)
      ? 404
      : /ADVANCE_NOT_PENDING|ADVANCE_ALREADY_DEDUCTED/.test(message)
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
