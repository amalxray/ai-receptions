import { NextResponse } from 'next/server';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { unlockPayrollPeriod } from '@/lib/services/payroll-engine';
import { logEvent } from '@/lib/server/logging';

export const runtime = 'nodejs';

/**
 * POST /api/clinic/payroll/periods/[periodId]/unlock — OWNER ONLY.
 *
 * Unlocking returns a finalized period to draft so a corrected run can be
 * regenerated; it is the one operation that can move money backwards, so it is
 * restricted to the clinic OWNER (not even a manager), requires a written
 * reason of at least 5 characters, and is counted + audited in
 * payroll_audit_log and the generic audit log.
 */
export async function POST(req: Request, { params }: { params: Promise<{ periodId: string }> }) {
  try {
    const { periodId } = await params;
    const body = await req.json().catch(() => null);
    const clinicId = body?.clinic_id;
    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 });

    const authorization = await authorizeClinicRequest(req, clinicId);
    if (!authorization.authorized) {
      return NextResponse.json(
        { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
        { status: authorization.status }
      );
    }
    if (authorization.role !== 'owner') {
      return NextResponse.json({ error: 'Only the clinic owner can unlock a payroll period' }, { status: 403 });
    }
    if (!authorization.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 5) {
      return NextResponse.json({ error: 'UNLOCK_REASON_REQUIRED', detail: 'سبب الإلغاء مطلوب (5 أحرف على الأقل)' }, { status: 400 });
    }

    const data = await unlockPayrollPeriod({
      clinicId,
      periodId,
      actorUserId: authorization.user.id,
      reason,
    });
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logEvent('payroll_unlock_error', { error: message }, 'error');
    const status = /UNLOCK_REASON_TOO_SHORT|CANNOT_UNLOCK_THIS_STATUS/.test(message)
      ? 400
      : /PERIOD_NOT_FOUND/.test(message)
        ? 404
        : /PERIOD_STATE_CONFLICT|PAYROLL_PERIOD/.test(message)
          ? 409
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
