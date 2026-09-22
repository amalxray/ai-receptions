// #43 — One-call permission gate for clinic API routes, layered on top of
// authorizeClinicRequest. Returns a NextResponse rejection or null when the
// caller holds the required permission.
//
// Fail-closed with a deterministic fallback: if the flexible layer cannot be
// resolved (tables not migrated yet, transient DB failure, …) the decision
// falls back to ROLE_DEFAULTS — which mirrors the legacy role tables, so
// behaviour never silently widens. Owner is always allowed.
import { NextResponse } from 'next/server';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import { getUserPermissions, hasPermission, ROLE_DEFAULTS, type PermissionKey } from '@/lib/auth/permissions';

export async function permissionDenied(
  req: Request,
  clinicId: string,
  required: PermissionKey
): Promise<NextResponse | null> {
  const authorization = await authorizeClinicRequest(req, clinicId);
  if (!authorization.authorized) {
    return NextResponse.json(
      { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: authorization.status }
    );
  }

  const role = authorization.role ?? 'staff';

  let allowed: boolean;
  try {
    const perms = await getUserPermissions(authorization.user?.id ?? '', clinicId, role);
    allowed = hasPermission(perms, required);
  } catch {
    allowed = (ROLE_DEFAULTS[role] ?? []).includes(required);
  }

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
