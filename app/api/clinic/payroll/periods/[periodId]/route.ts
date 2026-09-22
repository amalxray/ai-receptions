import { NextResponse } from 'next/server';
import { authorizeClinicRequest, roleDenied, FINANCE_ADMIN_ROLES, FINANCE_READ_ROLES } from '@/lib/services/clinicAuthorization';
import {
  getPayrollPeriodDetail,
  approvePayrollPeriod,
  markPayrollPaid,
  cancelPayrollPeriod,
} from '@/lib/services/payroll-engine';

// Payroll period detail + lifecycle.
// GET   ?clinic_id=…                 → FINANCE_READ (period + payslips + adjustments)
// PATCH { clinic_id, action }        → FINANCE_ADMIN
//         action: 'approve' | 'pay' | 'cancel' (draft → approved → paid)

export async function GET(req: Request, { params }: { params: Promise<{ periodId: string }> }) {
  try {
    const { periodId } = await params;
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    const denied = roleDenied(authorization, FINANCE_READ_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });

    const data = await getPayrollPeriodDetail(clinicId, periodId);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: /PERIOD_NOT_FOUND/.test(message) ? 404 : 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ periodId: string }> }) {
  try {
    const { periodId } = await params;
    const body = await req.json();
    if (!body?.clinic_id) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const action = String(body.action ?? '');
    if (!['approve', 'pay', 'cancel'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve | pay | cancel' }, { status: 400 });
    }

    const authorization = await authorizeClinicRequest(req, body.clinic_id);
    const denied = roleDenied(authorization, FINANCE_ADMIN_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });

    const actorUserId = authorization.user?.id ?? null;
    const clinicId = body.clinic_id as string;

    if (action === 'approve') {
      const data = await approvePayrollPeriod({ clinicId, periodId, actorUserId });
      return NextResponse.json({ data });
    }
    if (action === 'pay') {
      const data = await markPayrollPaid({ clinicId, periodId, actorUserId });
      return NextResponse.json({ data });
    }
    const data = await cancelPayrollPeriod({ clinicId, periodId, actorUserId, reason: body.reason ?? null });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /PERIOD_NOT_FOUND/.test(message)
      ? 404
      : /PERIOD_STATE_CONFLICT|PAYROLL_PERIOD_EMPTY|PAYROLL_NET_NOT_POSITIVE|PAYROLL_PERIOD_INVALID_TRANSITION|PAYROLL_PERIOD_LOCKED/.test(message)
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
