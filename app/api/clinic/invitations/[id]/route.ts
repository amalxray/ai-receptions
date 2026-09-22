import { NextResponse } from 'next/server';
import { authorizeClinicRequest, roleDenied, ADMIN_ROLES } from '@/lib/services/clinicAuthorization';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';
import { writeAuditLog } from '@/lib/services/auditService';

export const runtime = 'nodejs';

/**
 * REVOKE a pending team invitation (#38).
 *
 * DELETE /api/clinic/invitations/{id}?clinic_id=…
 *
 * Soft revoke: the row is kept with status='revoked' (accepted/revoked history is
 * audit-relevant) so the emailed link can never be used again.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const clinicId = url.searchParams.get('clinic_id');
  if (!clinicId) return NextResponse.json({ error: 'clinic_id is required' }, { status: 400 });

  const authorization = await authorizeClinicRequest(req, clinicId);
  if (!authorization.authorized) {
    return NextResponse.json(
      { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: authorization.status }
    );
  }
  if (roleDenied(authorization, ADMIN_ROLES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: invitation } = await supabaseAdmin
    .from('invitations')
    .select('id, status')
    .eq('id', params.id)
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (!invitation) return NextResponse.json({ error: 'الدعوة غير موجودة' }, { status: 404 });
  if (invitation.status !== 'pending') {
    return NextResponse.json({ error: 'الدعوة لم تعد معلقة' }, { status: 409 });
  }

  const { error } = await supabaseAdmin
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', invitation.id)
    .eq('clinic_id', clinicId)
    .eq('status', 'pending');

  if (error) {
    logEvent('team_invitation_revoke_error', { clinic_id: clinicId, invitation_id: invitation.id, error: error.message }, 'error');
    return NextResponse.json({ error: 'تعذر إلغاء الدعوة' }, { status: 500 });
  }

  await writeAuditLog({
    clinicId,
    actorUserId: authorization.user.id,
    action: 'invitation.revoke',
    resourceType: 'invitation',
    resourceId: invitation.id,
  });

  return NextResponse.json({ success: true });
}
