import { NextResponse } from 'next/server';
import { authorizeClinicRequest, roleDenied, FINANCE_ADMIN_ROLES, FINANCE_READ_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { listAdvances, createAdvance } from '@/lib/services/payroll-engine';

// Staff advances — money handed to a person, recovered from a later payroll.
// GET  ?clinic_id=…[&provider_id=&status=&from=&to=] → FINANCE_READ
// POST { clinic_id, provider_id, amount, reason?, issued_at? } → FINANCE_ADMIN

const STATUSES = ['pending', 'deducted', 'cancelled'] as const;
type AdvanceStatus = (typeof STATUSES)[number];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    const denied = roleDenied(authorization, FINANCE_READ_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });
    const permBlocked = await permissionDenied(req, clinicId, 'view_advances', { allowedRoles: FINANCE_READ_ROLES });
    if (permBlocked) return permBlocked;

    const statusParam = url.searchParams.get('status');
    const data = await listAdvances(clinicId, {
      providerId: url.searchParams.get('provider_id') ?? undefined,
      status: statusParam && (STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as AdvanceStatus)
        : undefined,
      fromDate: url.searchParams.get('from') ?? undefined,
      toDate: url.searchParams.get('to') ?? undefined,
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
    if (!body?.provider_id) return NextResponse.json({ error: 'provider_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, body.clinic_id);
    const denied = roleDenied(authorization, FINANCE_ADMIN_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });
    const permBlocked = await permissionDenied(req, body.clinic_id, 'manage_advances', { allowedRoles: FINANCE_ADMIN_ROLES });
    if (permBlocked) return permBlocked;

    const data = await createAdvance({
      clinicId: body.clinic_id,
      providerId: body.provider_id,
      amount: body.amount,
      reason: body.reason ?? null,
      issuedAt: body.issued_at ?? null,
      notes: body.notes ?? null,
      // Phase 2 — the advance can be recovered over 1..12 monthly payrolls.
      installmentCount: body.installment_count ?? 1,
      actorUserId: authorization.user?.id ?? null,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /ADVANCE_AMOUNT_INVALID|PROVIDER_INACTIVE|ADVANCE_INSTALLMENTS_INVALID/.test(message)
      ? 400
      : /PROVIDER_NOT_FOUND/.test(message)
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
