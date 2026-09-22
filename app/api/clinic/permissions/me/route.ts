import { NextResponse } from 'next/server';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { getUserPermissions } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

// #43 — the CALLER's effective permission keys for a clinic.
// Used by the sidebar to render only the modules the member may open.
export async function GET(req: Request) {
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

  const perms = await getUserPermissions(
    authorization.user.id,
    clinicId,
    authorization.role ?? 'staff'
  );

  return NextResponse.json({ data: Array.from(perms) });
}
