import { NextResponse } from 'next/server';
import { authorizeClinicRequest, roleDenied, FINANCE_READ_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { listPayrollAudit } from '@/lib/services/payroll-engine';

export const runtime = 'nodejs';

// GET /api/clinic/payroll/audit?clinic_id=…[&period_id=…][&limit=…]
// The payroll audit trail (generated / approved / paid / cancelled / unlocked).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    const denied = roleDenied(authorization, FINANCE_READ_ROLES);
    if (denied) return NextResponse.json({ error: denied.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: denied.status });
    const permBlocked = await permissionDenied(req, clinicId, 'view_payroll', { allowedRoles: FINANCE_READ_ROLES });
    if (permBlocked) return permBlocked;

    const limitParam = Number(url.searchParams.get('limit'));
    const logs = await listPayrollAudit(clinicId, {
      periodId: url.searchParams.get('period_id') ?? undefined,
      limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
    });
    return NextResponse.json({ logs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
