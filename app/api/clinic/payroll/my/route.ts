import { NextResponse } from 'next/server';
import { authorizeClinicRequest, DATA_ROLES } from '@/lib/services/clinicAuthorization';
import { permissionDenied } from '@/lib/services/permissionGate';
import { listSelfPayslips } from '@/lib/services/payroll-engine';

export const runtime = 'nodejs';

// Self-service payroll: GET /api/clinic/payroll/my?clinic_id=…
//
// Returns ONLY the caller's own payslips/advances. The employee ↔ provider link
// is providers.user_id = the authenticated user, resolved server-side — the
// request carries no provider id at all, so there is nothing to tamper with.
// Publication rule: only approved/paid periods are visible (a draft is internal).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }
    if (!authorization.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Everyone employed by the clinic may read their own pay — that is why the
    // legacy role set covers every membership role (DATA_ROLES + accountant).
    const permBlocked = await permissionDenied(req, clinicId, 'view_own_payslips', {
      allowedRoles: [...DATA_ROLES, 'accountant'],
    });
    if (permBlocked) return permBlocked;

    const data = await listSelfPayslips({ clinicId, userId: authorization.user.id });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
