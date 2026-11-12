import { NextResponse } from 'next/server';
import { authorizeClinicRequest, FINANCE_ADMIN_ROLES, FINANCE_READ_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { generatePayrollPeriod, listPayrollPeriods, type PayrollPeriodStatus } from '@/lib/services/payroll-engine';

// Payroll Engine — periods list + generation (draft).
// GET  ?clinic_id=…[&status=&from=&to=]  → view_payroll
// POST { clinic_id, period_month }       → manage_payroll (draft regenerate allowed)

const STATUSES: readonly PayrollPeriodStatus[] = ['draft', 'approved', 'paid', 'cancelled'];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    const permission = await permissionDenied(req, clinicId, 'view_payroll', { allowedRoles: FINANCE_READ_ROLES });
    if (permission) return permission;

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
    const permission = await permissionDenied(req, body.clinic_id, 'manage_payroll', { allowedRoles: FINANCE_ADMIN_ROLES });
    if (permission) return permission;

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
