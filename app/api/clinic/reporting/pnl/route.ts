import { NextResponse } from 'next/server';
import { permissionDenied } from '@/lib/services/permissionGate';
import { getProfitAndLoss } from '@/lib/services/reporting';

// P&L report (D-R1) — derived read-only. view_financial (D-P3/D-R3);
// claim kinds are structurally excluded by the view.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const permission = await permissionDenied(req, clinicId, 'view_financial');
    if (permission) return permission;

    const data = await getProfitAndLoss(clinicId, {
      fromMonth: url.searchParams.get('from_month') ?? undefined,
      toMonth: url.searchParams.get('to_month') ?? undefined,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /INVALID_/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
