import { NextResponse } from 'next/server';
import { authorizeClinicRequest, roleDenied, FINANCE_ADMIN_ROLES, FINANCE_READ_ROLES } from '@/lib/services/clinicAuthorization';
import { generatePayrollPeriod, listPayrollPeriods, type PayrollPeriodStatus } from '@/lib/services/payroll-engine';

// Payroll Engine — periods list + generation (draft).
// GET  ?clinic_id=…[&status=&from=&to=]  → FINANCE_READ
// POST { clinic_id, period_month }       → FINANCE_ADMIN (draft regenerate allowed)

const STATUSES: readonly PayrollPeriodStatus[] = ['draft', 'approved', 'paid', 'cancelled'];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    const denied = roleDenied(authorization, FINANCE_READ_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });

    const statusParam = url.searchParams.get('status');
    const data = await listPayrollPeriods(clinicId, {
      status: statusParam && STATUSES.includes(statusParam as PayrollPeriodStatus)
        ? (statusParam as PayrollPeriodStatus)
        : undefined,
      fromMonth: url.searchParams.get('from') ?? undefined,
      toMonth: url.searchParams.get('to') ?? undefined,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.clinic_id) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, body.clinic_id);
    const denied = roleDenied(authorization, FINANCE_ADMIN_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });

    const result = await generatePayrollPeriod({
      clinicId: body.clinic_id,
      periodMonth: String(body.period_month ?? ''),
      actorUserId: authorization.user?.id ?? null,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /PAYROLL_PERIOD_MONTH_INVALID/.test(message)
      ? 400
      : /PERIOD_ALREADY_FINALIZED|PAYROLL_PERIOD_LOCKED|PAYROLL_PAYSLIP_PERIOD_LOCKED/.test(message)
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
