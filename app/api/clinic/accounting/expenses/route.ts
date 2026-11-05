import { NextResponse } from 'next/server';
import { authorizeClinicRequest, roleDenied, EXPENSE_RECORD_ROLES, FINANCE_READ_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { recordExpense, listExpenses } from '@/lib/services/accounting';

// Accounting Phase C — expenses. POST = record (immutable movement), GET = list.
// #43 — expense mutations additionally require the `manage_expenses` permission.
const EXPENSE_ERRORS = /EXPENSE_AMOUNT_INVALID|EXPENSE_METHOD_INVALID|EXPENSE_CATEGORY_INVALID|EXPENSE_SPENT_AT_INVALID/;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.clinic_id) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const authorization = await authorizeClinicRequest(req, body.clinic_id);
    const denied = roleDenied(authorization, EXPENSE_RECORD_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });
    // #43 — per-permission enforcement (global by default, owner always allowed).
    const permBlocked = await permissionDenied(req, body.clinic_id, 'manage_expenses', { allowedRoles: EXPENSE_RECORD_ROLES });
    if (permBlocked) return permBlocked;

    const result = await recordExpense({
      clinicId: body.clinic_id,
      categoryId: body.category_id ?? null,
      amount: body.amount,
      method: body.method ?? 'cash',
      spentAt: body.spent_at ?? null,
      vendor: body.vendor ?? null,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
      idempotencyKey: body.idempotency_key ?? null,
      actorUserId: authorization.user?.id ?? null,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: EXPENSE_ERRORS.test(message) ? 400 : 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const authorization = await authorizeClinicRequest(req, clinicId);
    const denied = roleDenied(authorization, FINANCE_READ_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });
    // #43 — flexible layer on top of the legacy role matrix (never replaces it).
    const permBlocked = await permissionDenied(req, clinicId, 'view_financial', { allowedRoles: FINANCE_READ_ROLES });
    if (permBlocked) return permBlocked;
    const status = url.searchParams.get('status');
    if (status && !['recorded', 'voided'].includes(status)) {
      return NextResponse.json({ error: 'status must be recorded or voided' }, { status: 400 });
    }
    const parseInteger = (value: string | null, fallback: number) => {
      if (value === null || value.trim() === '') return fallback;
      const parsed = Number(value);
      return Number.isInteger(parsed) ? parsed : fallback;
    };
    const limit = Math.min(100, Math.max(1, parseInteger(url.searchParams.get('limit'), 50)));
    const offset = Math.max(0, parseInteger(url.searchParams.get('offset'), 0));
    const result = await listExpenses(clinicId, {
      categoryId: url.searchParams.get('category_id'),
      status,
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      limit,
      offset,
    });
    return NextResponse.json({ data: result.items, pagination: { limit, offset, hasMore: result.hasMore } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
