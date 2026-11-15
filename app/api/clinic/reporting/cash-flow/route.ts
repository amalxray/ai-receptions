import { NextResponse } from 'next/server';
import { permissionDenied } from '@/lib/services/permissionGate';
import { getCashFlow } from '@/lib/services/reporting';

// Cash Flow report (D-R2) — derived read-only, METHOD breakdown from source
// rows; `direction` is never a method or cash signal.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const permission = await permissionDenied(req, clinicId, 'view_financial');
    if (permission) return permission;

    const method = url.searchParams.get('method');
    const data = await getCashFlow(clinicId, {
      fromMonth: url.searchParams.get('from_month') ?? undefined,
      toMonth: url.searchParams.get('to_month') ?? undefined,
      method: method === 'cash' || method === 'card' || method === 'bank_transfer' || method === 'other'
        ? method
        : undefined,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /INVALID_/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
