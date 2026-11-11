import { NextResponse } from 'next/server';
import { authorizeClinicRequest, FINANCE_ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { refundPayment } from '@/lib/services/accounting';

export async function POST(req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  try {
    const { paymentId } = await params;
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const authorization = await authorizeClinicRequest(req, clinicId);
    const permission = await permissionDenied(req, clinicId, 'manage_payments', { allowedRoles: FINANCE_ADMIN_ROLES });
    if (permission) return permission;
    const body = await req.json();
    const result = await refundPayment({
      clinicId,
      paymentId,
      amount: body?.amount,
      reason: body?.reason ?? '',
      actorUserId: authorization.user?.id ?? null,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /REFUND_AMOUNT_INVALID|REFUND_REASON_REQUIRED|REFUND_ONLY_ON_PAYMENT|PAYMENT_VOIDED|REFUND_EXCEEDS_PAID/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}