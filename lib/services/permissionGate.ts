// #43 — One-call permission gate for clinic API routes, layered on top of
// authorizeClinicRequest.
//
// SEMANTICS (regression-safe by design):
//   1. authorizeClinicRequest must succeed (real token + active membership).
//   2. An EXPLICIT per-user override decides first. For a single key, false
//      revokes it; for an any-of gate, access remains if another key is granted.
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
  required: PermissionKey | readonly PermissionKey[],
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
    const requiredKeys = typeof required === 'string' ? [required] : required;
    const explicitlyDeniedAll = requiredKeys.every((key) => state.overrides.get(key) === false);
    if (explicitlyDeniedAll) {
      // An explicit revocation beats every other source when no alternative key
      // in an OR-gated read remains granted.
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (requiredKeys.some((key) => state.overrides.get(key) === true)) {
      return null;
    }
    allowed = legacyAllowed || requiredKeys.some((key) => hasPermission(state.permissions, key));
  } catch {
    const requiredKeys = typeof required === 'string' ? [required] : required;
    allowed = legacyAllowed || requiredKeys.some((key) => (ROLE_DEFAULTS[role] ?? []).includes(key));
  }

  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

