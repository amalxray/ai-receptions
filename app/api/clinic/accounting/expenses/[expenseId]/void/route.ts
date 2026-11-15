import { NextResponse } from 'next/server';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { voidExpense } from '@/lib/services/accounting';

// Accounting Phase C — void an expense (manage_expenses; bookkeeping void,
// nothing is deleted). Mirrors the invoice void route pattern.
export async function POST(req: Request, { params }: { params: Promise<{ expenseId: string }> }) {
  try {
    const { expenseId } = await params;
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const authorization = await authorizeClinicRequest(req, clinicId);
    const denied = await permissionDenied(req, clinicId, 'manage_expenses');
    if (denied) return denied;
    const body = await req.json();
    await voidExpense({ clinicId, expenseId, reason: body?.reason ?? '', actorUserId: authorization.user?.id ?? null });
    return NextResponse.json({ data: { voided: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /VOID_REASON_REQUIRED|EXPENSE_NOT_FOUND|EXPENSE_ALREADY_VOIDED|EXPENSE_VOIDED_IS_TERMINAL/.test(message)
      ? (message === 'EXPENSE_NOT_FOUND' ? 404 : 400)
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
