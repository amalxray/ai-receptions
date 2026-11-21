import { NextResponse } from 'next/server';
import { authorizeClinicRequest, FINANCE_ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { reviseCompensation } from '@/lib/services/payroll';

export async function POST(req: Request, { params }: { params: Promise<{ compensationId: string }> }) {
  try {
    const { compensationId } = await params;
    const body = await req.json();
    if (!body?.clinic_id) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, body.clinic_id);
    const permission = await permissionDenied(req, body.clinic_id, 'manage_payroll', { allowedRoles: FINANCE_ADMIN_ROLES });
    if (permission) return permission;

    const data = await reviseCompensation({
      clinicId: body.clinic_id,
      compensationId,
      effectiveFrom: body.effective_from,
      commissionPercent: body.commission_percent ?? null,
      fixedMonthlyAmount: body.fixed_monthly_amount ?? null,
      actorUserId: authorization.user?.id ?? null,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /COMPENSATION_EFFECTIVE_DATE_INVALID|COMPENSATION_EFFECTIVE_DATE_MUST_BE_FUTURE|COMPENSATION_MODEL_FIELDS_MISMATCH|COMPENSATION_VALUE_INVALID/.test(message)
      ? 400
      : /COMPENSATION_NOT_FOUND/.test(message)
        ? 404
        : /COMPENSATION_NOT_ACTIVE|COMPENSATION_REVISION_DATE_NOT_AFTER_CURRENT|duplicate key|unique constraint/i.test(message)
          ? 409
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
