import { NextResponse } from 'next/server';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { voidPayment } from '@/lib/services/accounting';

export async function POST(req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  try {
    const { paymentId } = await params;
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const authorization = await authorizeClinicRequest(req, clinicId);
    const denied = await permissionDenied(req, clinicId, 'manage_payments');
    if (denied) return denied;
    const body = await req.json();
    await voidPayment({ clinicId, paymentId, reason: body?.reason ?? '', actorUserId: authorization.user?.id ?? null });
    return NextResponse.json({ data: { voided: true } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /VOID_REASON_REQUIRED|PAYMENT_NOT_FOUND|PAYMENT_ALREADY_VOIDED/.test(message) ? (message === 'PAYMENT_NOT_FOUND' ? 404 : 400) : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
