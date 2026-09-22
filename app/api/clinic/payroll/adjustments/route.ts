import { NextResponse } from 'next/server';
import { authorizeClinicRequest, roleDenied, FINANCE_ADMIN_ROLES, FINANCE_READ_ROLES } from '@/lib/services/clinicAuthorization';
import { addPayslipAdjustment, getPayrollPeriodDetail } from '@/lib/services/payroll-engine';

// Bonuses / deductions for a (draft period, provider).
// GET    ?clinic_id=…&period_id=…                     → FINANCE_READ
// POST   { clinic_id, period_id, provider_id, type, amount, reason } → FINANCE_ADMIN
//        Regenerate the period afterwards to fold the line into the payslip
//        totals (the engine reads adjustments at generation time).
// DELETE the line: /api/clinic/payroll/adjustments/[adjustmentId]

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    const periodId = url.searchParams.get('period_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    if (!periodId) return NextResponse.json({ error: 'period_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    const denied = roleDenied(authorization, FINANCE_READ_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });

    const detail = await getPayrollPeriodDetail(clinicId, periodId);
    return NextResponse.json({ data: detail.adjustments });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: /PERIOD_NOT_FOUND/.test(message) ? 404 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.clinic_id) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    if (!body?.period_id) return NextResponse.json({ error: 'period_id required' }, { status: 400 });
    if (!body?.provider_id) return NextResponse.json({ error: 'provider_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, body.clinic_id);
    const denied = roleDenied(authorization, FINANCE_ADMIN_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });

    const data = await addPayslipAdjustment({
      clinicId: body.clinic_id,
      periodId: body.period_id,
      providerId: body.provider_id,
      type: body.type,
      amount: body.amount,
      reason: body.reason,
      actorUserId: authorization.user?.id ?? null,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /ADJUSTMENT_AMOUNT_INVALID|ADJUSTMENT_REASON_REQUIRED|ADJUSTMENT_TYPE_INVALID/.test(message)
      ? 400
      : /PAYSLIP_NOT_FOUND|PERIOD_NOT_FOUND/.test(message)
        ? 404
        : /PERIOD_STATE_CONFLICT|PERIOD_ALREADY_FINALIZED/.test(message)
          ? 409
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
