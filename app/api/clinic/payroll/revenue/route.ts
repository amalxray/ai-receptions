import { NextResponse } from 'next/server';
import { FINANCE_READ_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { listProviderRevenue } from '@/lib/services/payroll';

// Provider revenue — DERIVED read-only (D-P2: issued base). FINANCE_READ
// only (D-P3); no doctor self-visibility in this phase; never a write path.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });
    const permission = await permissionDenied(req, clinicId, 'view_payroll', { allowedRoles: FINANCE_READ_ROLES });
    if (permission) return permission;
    const data = await listProviderRevenue(clinicId, {
      providerId: url.searchParams.get('provider_id') ?? undefined,
      fromMonth: url.searchParams.get('from_month') ?? undefined,
      toMonth: url.searchParams.get('to_month') ?? undefined,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
