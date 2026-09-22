import { NextResponse } from 'next/server';
import { authorizeClinicRequest, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { getPayslipDetail } from '@/lib/services/payroll-engine';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';

// GET /api/clinic/payroll/payslips/[payslipId]?clinic_id=…
// Readable by an admin OR by the provider the payslip belongs to (self-service).
// A draft period is internal: only admins can read its payslips.
export async function GET(req: Request, { params }: { params: Promise<{ payslipId: string }> }) {
  try {
    const { payslipId } = await params;
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

    const data = await getPayslipDetail({
      clinicId,
      payslipId,
      userId: authorization.user.id,
      isAdmin: ADMIN_ROLES.includes(authorization.role ?? ''),
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/FORBIDDEN/.test(message)) {
      logEvent('payroll_payslip_forbidden', { payslip_id: (await params).payslipId }, 'error');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: /PAYSLIP_NOT_FOUND/.test(message) ? 404 : 500 });
  }
}
