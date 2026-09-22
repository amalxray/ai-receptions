import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #43 — permissionGate semantics. This is the layer that must never silently
 * revoke a capability a role already had:
 *
 *   explicit revoke  → 403 (wins over everything)
 *   explicit grant   → allowed (widens access)
 *   legacy role set  → allowed (no regression)
 *   resolved set     → allowed (role defaults / custom role)
 *   resolution fails → fall back to the legacy role set only (fail-safe)
 *
 * Regression this file exists for: gating invoices with `manage_invoices`
 * dropped ROLE_DEFAULTS.receptionist → front-desk invoicing started returning
 * 403 after #43.
 */

const mockAuth = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
}));
vi.mock('@/lib/services/clinicAuthorization', () => mockAuth);

const mockPermissions = vi.hoisted(() => ({
  getUserPermissionState: vi.fn(),
}));
vi.mock('@/lib/auth/permissions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/permissions')>('@/lib/auth/permissions');
  return { ...actual, getUserPermissionState: mockPermissions.getUserPermissionState };
});

import { permissionDenied } from '@/lib/services/permissionGate';
import { ROLE_DEFAULTS } from '@/lib/auth/permissions';

const CLINIC = '11111111-1111-1111-1111-111111111111';
const USER = 'cccc-1111-1111-1111-111111111111';
// The legacy finance gate for invoice creation (see clinicAuthorization).
const INVOICE_CREATE_ROLES = ['owner', 'accountant', 'receptionist'] as const;

function makeRequest(): Request {
  return new Request('https://test.local/api/clinic/accounting/invoices', {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
  });
}

function roleState(role: string, overrides: Record<string, boolean> = {}) {
  const permissions = new Set<string>(ROLE_DEFAULTS[role] ?? []);
  for (const [key, enabled] of Object.entries(overrides)) {
    if (enabled) permissions.add(key);
    else permissions.delete(key);
  }
  return { permissions, overrides: new Map(Object.entries(overrides)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: USER }, role: 'receptionist' });
  mockPermissions.getUserPermissionState.mockResolvedValue(roleState('receptionist'));
});

describe('permissionDenied — authentication passthrough', () => {
  it('propagates 401 when the caller has no valid token', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 401 });
    const res = await permissionDenied(makeRequest(), CLINIC, 'manage_invoices');
    expect(res?.status).toBe(401);
  });

  it('propagates 403 when the caller is not a clinic member', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 403 });
    const res = await permissionDenied(makeRequest(), CLINIC, 'manage_invoices');
    expect(res?.status).toBe(403);
  });
});

describe('permissionDenied — legacy role sets still work (no #43 regression)', () => {
  it('allows a receptionist to create invoices when the route passes its legacy roles', async () => {
    const res = await permissionDenied(makeRequest(), CLINIC, 'manage_invoices', {
      allowedRoles: INVOICE_CREATE_ROLES,
    });
    expect(res).toBeNull();
    // receptionist has no finance key in the registry — the legacy set is the
    // only reason this is allowed.
    expect(ROLE_DEFAULTS.receptionist).not.toContain('manage_invoices');
  });

  it('denies the same receptionist when the route forgot its legacy roles', async () => {
    const res = await permissionDenied(makeRequest(), CLINIC, 'manage_invoices');
    expect(res?.status).toBe(403);
  });

  it('denies a role outside the legacy set (least privilege)', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: USER }, role: 'staff' });
    mockPermissions.getUserPermissionState.mockResolvedValue(roleState('staff'));
    const res = await permissionDenied(makeRequest(), CLINIC, 'manage_invoices', {
      allowedRoles: INVOICE_CREATE_ROLES,
    });
    expect(res?.status).toBe(403);
  });
});

describe('permissionDenied — explicit per-user decisions', () => {
  it('an explicit revoke wins even when the legacy role set allows the call', async () => {
    mockPermissions.getUserPermissionState.mockResolvedValue(
      roleState('receptionist', { manage_invoices: false })
    );
    const res = await permissionDenied(makeRequest(), CLINIC, 'manage_invoices', {
      allowedRoles: INVOICE_CREATE_ROLES,
    });
    expect(res?.status).toBe(403);
  });

  it('an explicit grant widens access for a role outside the legacy set', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: USER }, role: 'staff' });
    mockPermissions.getUserPermissionState.mockResolvedValue(roleState('staff', { manage_invoices: true }));
    const res = await permissionDenied(makeRequest(), CLINIC, 'manage_invoices', {
      allowedRoles: INVOICE_CREATE_ROLES,
    });
    expect(res).toBeNull();
  });

  it('allows when the resolved set carries the permission without an override', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: USER }, role: 'accountant' });
    mockPermissions.getUserPermissionState.mockResolvedValue(roleState('accountant'));
    const res = await permissionDenied(makeRequest(), CLINIC, 'manage_invoices');
    expect(res).toBeNull();
  });

  it('owner resolves to every permission', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: USER }, role: 'owner' });
    mockPermissions.getUserPermissionState.mockResolvedValue(roleState('owner'));
    const res = await permissionDenied(makeRequest(), CLINIC, 'manage_invoices');
    expect(res).toBeNull();
  });
});

describe('permissionDenied — resolution failure is fail-safe', () => {
  it('falls back to the legacy role set when the flexible layer cannot resolve', async () => {
    mockPermissions.getUserPermissionState.mockRejectedValue(new Error('PGRST205 user_permissions missing'));
    const res = await permissionDenied(makeRequest(), CLINIC, 'manage_invoices', {
      allowedRoles: INVOICE_CREATE_ROLES,
    });
    expect(res).toBeNull();
  });

  it('falls back to role defaults when no legacy set is passed', async () => {
    mockPermissions.getUserPermissionState.mockRejectedValue(new Error('boom'));
    const res = await permissionDenied(makeRequest(), CLINIC, 'view_financial');
    expect(res?.status).toBe(403);
  });

  it('still denies a role that the fallback defaults do not cover', async () => {
    mockPermissions.getUserPermissionState.mockRejectedValue(new Error('boom'));
    const res = await permissionDenied(makeRequest(), CLINIC, 'manage_invoices', {
      allowedRoles: ['owner', 'accountant'],
    });
    expect(res?.status).toBe(403);
  });
});
