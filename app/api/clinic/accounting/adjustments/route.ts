import { NextResponse } from 'next/server';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { recordWriteOff, listWriteOffs } from '@/lib/services/accounting';

// Accounting Phase B — write-offs (D-B2).
// POST = record a write-off (manage_invoices). GET = list (view_financial).

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.clinic_id) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const authorization = await authorizeClinicRequest(req, body.clinic_id);
    const permission = await permissionDenied(req, body.clinic_id, 'manage_invoices');
    if (permission) return permission;

    const result = await recordWriteOff({
      clinicId: body.clinic_id,
      invoiceId: body.invoice_id,
      amount: body.amount,
      reason: body.reason ?? '',
      idempotencyKey: body.idempotency_key ?? null,
      actorUserId: authorization.user?.id ?? null,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /WRITE_OFF_AMOUNT_INVALID|WRITE_OFF_REASON_REQUIRED|INVOICE_NOT_FOUND|INVOICE_VOIDED|NO_REMAINING_BALANCE|WRITE_OFF_EXCEEDS_BALANCE/.test(message)
      ? message === 'INVOICE_NOT_FOUND'
        ? 404
        : 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const permission = await permissionDenied(req, clinicId, ['view_financial', 'manage_invoices']);
    if (permission) return permission;
    const data = await listWriteOffs(clinicId, url.searchParams.get('invoice_id'));
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
