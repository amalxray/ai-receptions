import { NextResponse } from 'next/server';
import { authorizeClinicRequest, roleDenied, EXPENSE_RECORD_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { updateExpense } from '@/lib/services/accounting';

export async function PATCH(req: Request, { params }: { params: Promise<{ expenseId: string }> }) {
  try {
    const { expenseId } = await params;
    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id') ?? (typeof body?.clinic_id === 'string' ? body.clinic_id : '');
    if (!clinicId) {
      return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    }

    const authorization = await authorizeClinicRequest(req, clinicId);
    const denied = roleDenied(authorization, EXPENSE_RECORD_ROLES);
    if (denied) {
      return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });
    }

    const permBlocked = await permissionDenied(req, clinicId, 'manage_expenses', { allowedRoles: EXPENSE_RECORD_ROLES });
    if (permBlocked) return permBlocked;

    const forbiddenFields = ['amount', 'spent_at', 'method'].filter((field) => Object.prototype.hasOwnProperty.call(body ?? {}, field));
    if (forbiddenFields.length > 0) {
      return NextResponse.json(
        { error: 'لتصحيح المبلغ/التاريخ: ألغِ المصروف ثم سجّل من جديد' },
        { status: 400 }
      );
    }
    const invalidFields = ['notes', 'vendor', 'category_id'].filter((field) => {
      const value = body?.[field];
      return value !== undefined && value !== null && typeof value !== 'string';
    });
    if (invalidFields.length > 0) {
      return NextResponse.json({ error: `Invalid field: ${invalidFields.join(', ')}` }, { status: 400 });
    }

    const { data: currentExpense, error: lookupError } = await supabaseAdmin
      .from('clinic_expenses')
      .select('id, status')
      .eq('clinic_id', clinicId)
      .eq('id', expenseId)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);
    if (!currentExpense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }
    if (currentExpense.status === 'voided') {
      return NextResponse.json({ error: 'المصروف مُلغى ولا يمكن تعديله.' }, { status: 400 });
    }

    const data = await updateExpense({
      clinicId,
      expenseId,
      notes: body?.notes,
      vendor: body?.vendor,
      categoryId: body?.category_id,
      actorUserId: authorization.user?.id ?? null,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /EXPENSE_NOT_FOUND|Expense not found/.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
