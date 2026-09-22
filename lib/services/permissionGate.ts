// #43 — One-call permission gate for clinic API routes, layered on top of
// authorizeClinicRequest.
//
// SEMANTICS (regression-safe by design):
//   1. authorizeClinicRequest must succeed (real token + active membership).
//   2. An EXPLICIT per-user override of the required permission decides first:
//        enabled = false → 403 (revocation always wins)
//        enabled = true  → allowed (a grant can widen access)
//   3. Otherwise the LEGACY role gate still applies (`allowedRoles`): a role
//      that could call this endpoint before #43 keeps that ability. The
//      flexible layer ADDS capabilities and lets an owner REVOKE explicitly —
//      it must never silently take away front-desk/legacy behaviour.
//   4. Otherwise the resolved permission set decides (role defaults, or a
//      clinic custom role carrying the member's role name).
//   5. If the flexible layer cannot be resolved at all (tables not migrated,
//      transient DB failure) we fall back to the legacy role gate so a DB
//      hiccup cannot lock out staff who are entitled by role.
import { NextResponse } from 'next/server';
import { authorizeClinicRequest } from '@/lib/services/clinicAuthorization';
import {
  getUserPermissionState,
  hasPermission,
  ROLE_DEFAULTS,
  type PermissionKey,
} from '@/lib/auth/permissions';

export interface PermissionGateOptions {
  /**
   * Legacy role set that was allowed to call this endpoint before #43.
   * Preserves existing behaviour unless the owner revokes explicitly.
   */
  allowedRoles?: readonly string[];
}

export async function permissionDenied(
  req: Request,
  clinicId: string,
  required: PermissionKey,
  options: PermissionGateOptions = {}
): Promise<NextResponse | null> {
  const authorization = await authorizeClinicRequest(req, clinicId);
  if (!authorization.authorized) {
    return NextResponse.json(
      { error: authorization.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: authorization.status }
    );
  }

  const role = authorization.role ?? 'staff';
  const legacyAllowed = (options.allowedRoles ?? []).includes(role);

  let allowed: boolean;
  try {
    const state = await getUserPermissionState(authorization.user?.id ?? '', clinicId, role);
    const explicit = state.overrides.get(required);

    if (explicit === false) {
      // Explicit revocation beats every other source of access.
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (explicit === true) {
      return null;
    }
    allowed = legacyAllowed || hasPermission(state.permissions, required);
  } catch {
    allowed = legacyAllowed || (ROLE_DEFAULTS[role] ?? []).includes(required);
  }

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

