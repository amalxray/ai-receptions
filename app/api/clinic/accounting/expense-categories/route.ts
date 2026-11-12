import { NextResponse } from 'next/server';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { listExpenseCategories, createExpenseCategory } from '@/lib/services/accounting';

// Accounting Phase C — expense categories (per-clinic config).
// POST = create, GET = list. Categories are never deleted (deactivate only).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.clinic_id) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const authorization = await authorizeClinicRequest(req, body.clinic_id);
    const permBlocked = await permissionDenied(req, body.clinic_id, 'manage_expenses');
    if (permBlocked) return permBlocked;

    const data = await createExpenseCategory({
      clinicId: body.clinic_id,
      name: body.name ?? '',
      actorUserId: authorization.user?.id ?? null,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /CATEGORY_NAME_REQUIRED/.test(message)
      ? 400
      : /duplicate key|unique constraint/i.test(message)
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const permBlocked = await permissionDenied(req, clinicId, ['view_financial', 'manage_expenses']);
    if (permBlocked) return permBlocked;
    const data = await listExpenseCategories(clinicId);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
