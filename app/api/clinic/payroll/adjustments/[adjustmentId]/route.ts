import { NextResponse } from 'next/server';
import { authorizeClinicRequest, FINANCE_ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { deletePayslipAdjustment } from '@/lib/services/payroll-engine';

// Remove a bonus/deduction line — allowed only while its period is a draft
// (approved runs are frozen). Regenerate the period to refresh the totals.
export async function DELETE(req: Request, { params }: { params: Promise<{ adjustmentId: string }> }) {
  try {
    const { adjustmentId } = await params;
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    const permission = await permissionDenied(req, clinicId, 'manage_payroll', { allowedRoles: FINANCE_ADMIN_ROLES });
    if (permission) return permission;

    const data = await deletePayslipAdjustment({ clinicId, adjustmentId, actorUserId: authorization.user?.id ?? null });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /ADJUSTMENT_NOT_FOUND/.test(message)
      ? 404
      : /PERIOD_STATE_CONFLICT/.test(message)
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
