import { describe, it, expect, vi, beforeEach } from 'vitest';

// #43 — dedicated matrix for the flexible permission system:
//   lib (defaults ⊕ custom roles ⊕ overrides, owner always-all)
//   + the new APIs (per-user overrides, custom roles, permissions/me).

const CLINIC = '11111111-1111-1111-1111-111111111111';
const USER = 'cccc-1111-1111-1111-111111111111';
const TARGET = 'dddd-1111-1111-1111-111111111111';

// ---------------------------------------------------------------------------
// Universal supabaseAdmin mock. respond[`${table}.${op}`] drives terminals.
// ---------------------------------------------------------------------------
const respond: Record<string, { data?: unknown; error?: unknown; count?: number }> = {};
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  let op = 'select';
  const terminal = async () => respond[`${table}.${op}`] ?? { data: null, error: null };
  b.select = vi.fn((_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
    if (opts?.count === 'exact' && opts?.head) op = 'count';
    return b;
  });
  b.insert = vi.fn(() => { op = 'insert'; return b; });
  b.update = vi.fn(() => { op = 'update'; return b; });
  b.delete = vi.fn(() => { op = 'delete'; return b; });
  b.eq = vi.fn(() => b);
  b.is = vi.fn(() => b);
  b.order = vi.fn(() => b);
  b.limit = vi.fn(() => b);
  b.maybeSingle = vi.fn(terminal);
  b.single = vi.fn(terminal);
  // awaited plain chains (lib getUserPermissions override fetch)
  b.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(onFulfilled(terminal()));
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeBuilder(table)),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return respond.rpc ?? { data: null, error: null };
    }),
  },
}));

const mockAuth = vi.hoisted(() => ({ authorizeClinicRequest: vi.fn() }));
vi.mock('@/lib/services/clinicAuthorization', () => ({
  ...mockAuth,
  roleDenied: (auth: { authorized: boolean; status?: number; role?: string }, allowed: readonly string[]) => {
    if (!auth.authorized) return { authorized: false, status: (auth.status ?? 401) as 401 | 403 };
    if (!allowed.includes(auth.role ?? '')) return { authorized: false, status: 403 as const };
    return null;
  },
  ADMIN_ROLES: ['owner', 'manager'],
}));

vi.mock('@/lib/services/auditService', () => ({ writeAuditLog: vi.fn(async () => undefined) }));

import { getUserPermissions, clearPermissionCache, ROLE_DEFAULTS, ALL_PERMISSION_KEYS } from '@/lib/auth/permissions';
import { POST as savePermissions, GET as getPermissions } from '@/app/api/clinic/team/[userId]/permissions/route';
import { POST as createRole, GET as listRoles } from '@/app/api/clinic/roles/route';
import { PATCH as patchRole, DELETE as deleteRole } from '@/app/api/clinic/roles/[roleId]/route';
import { GET as myPermissions } from '@/app/api/clinic/permissions/me/route';

function req(url: string, init?: RequestInit): Request {
  return new Request(`https://x.test${url}`, {
    ...init,
    headers: { authorization: 'Bearer t', ...(init?.headers ?? {}) },
  });
}
const ctx = (userId: string) => ({ params: { userId } }) as never;

beforeEach(() => {
  for (const k of Object.keys(respond)) delete respond[k];
  rpcCalls.length = 0;
  clearPermissionCache();
  mockAuth.authorizeClinicRequest.mockReset();
  mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: USER }, role: 'owner' });
});

describe('getUserPermissions (lib)', () => {
  it('grants the owner every permission without touching the DB', async () => {
    const perms = await getUserPermissions('u1', CLINIC, 'owner');
    expect(perms.size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it('applies ROLE_DEFAULTS for known roles', async () => {
    const perms = await getUserPermissions('u1', CLINIC, 'receptionist');
    for (const key of ROLE_DEFAULTS.receptionist) expect(perms.has(key)).toBe(true);
    expect(perms.has('manage_expenses')).toBe(false);
  });
});

describe('getUserPermissions — overrides ⊕ custom roles', () => {
  it('applies per-user overrides on top of role defaults (grant + revoke)', async () => {
    respond['user_permissions.select'] = {
      data: [
        { permission_key: 'manage_expenses', enabled: true },
        { permission_key: 'view_appointments', enabled: false },
      ],
      error: null,
    };
    const perms = await getUserPermissions('u2', CLINIC, 'receptionist');
    expect(perms.has('manage_expenses')).toBe(true); // granted despite default-deny
    expect(perms.has('view_appointments')).toBe(false); // revoked despite default-allow
    expect(perms.has('view_patients')).toBe(true);
  });

  it('custom role permissions replace the static defaults for that role name', async () => {
    respond['custom_roles.select'] = { data: { permissions: ['view_analytics'] }, error: null };
    const perms = await getUserPermissions('u3', CLINIC, 'سكرتيرة متقدمة');
    expect(Array.from(perms)).toEqual(['view_analytics']);
  });

  it('ignores unknown permission keys coming from the DB', async () => {
    respond['user_permissions.select'] = {
      data: [{ permission_key: 'not_a_real_permission', enabled: true }],
      error: null,
    };
    const perms = await getUserPermissions('u4', CLINIC, 'staff');
    expect(perms.has('not_a_real_permission' as never)).toBe(false);
  });
});

describe('GET /api/clinic/permissions/me', () => {
  it('returns the caller effective permission keys', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: USER }, role: 'staff' });
    const res = await myPermissions(req(`/api/clinic/permissions/me?clinic_id=${CLINIC}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    // The staff base is derived, never hard-coded: payroll (20261016) added
    // `view_own_payslips` to every employee role, and this assertion must not
    // rot into a false failure.
    expect(body.data).toEqual(expect.arrayContaining(['view_overview']));
    expect(body.data).not.toContain('view_financial');
    expect(body.data).not.toContain('manage_team');
  });

  it('rejects an unauthorized caller with the membership status', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 403 });
    const res = await myPermissions(req(`/api/clinic/permissions/me?clinic_id=${CLINIC}`));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/clinic/team/[userId]/permissions', () => {
  const body = (permissions: Record<string, boolean>) =>
    req(`/api/clinic/team/${TARGET}/permissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: CLINIC, permissions }),
    });

  it('stores overrides through the atomic RPC and clears the cache', async () => {
    respond['clinic_users.select'] = { data: { id: 'm1', role: 'doctor', deleted_at: null }, error: null };
    const res = await savePermissions(body({ manage_expenses: true }), ctx(TARGET));
    expect(res.status).toBe(200);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('set_user_permissions');
    // The ACTOR must be passed explicitly: auth.uid() is NULL under the
    // service-role client, so the old auth.uid()-bound function failed P0001.
    expect(rpcCalls[0].args).toMatchObject({
      p_actor_user_id: USER,
      p_user_id: TARGET,
      p_clinic_id: CLINIC,
    });
  });

  it('reports a required migration when the actor-aware RPC is absent (PGRST202)', async () => {
    respond['clinic_users.select'] = { data: { id: 'm1', role: 'doctor', deleted_at: null }, error: null };
    respond.rpc = {
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.set_user_permissions(p_actor_user_id, p_clinic_id, p_permissions, p_user_id)',
      },
    };
    const res = await savePermissions(body({ view_overview: true }), ctx(TARGET));
    delete respond.rpc;
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('PERMISSIONS_MIGRATION_REQUIRED');
  });

  it('rejects a non-admin caller (403)', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: USER }, role: 'doctor' });
    const res = await savePermissions(body({ view_financial: true }), ctx(TARGET));
    expect(res.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  it('rejects an unknown permission key (400)', async () => {
    const res = await savePermissions(body({ fake_key: true }), ctx(TARGET));
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it('refuses to touch the clinic owner (400)', async () => {
    respond['clinic_users.select'] = { data: { id: 'm0', role: 'owner', deleted_at: null }, error: null };
    const res = await savePermissions(body({ view_overview: false }), ctx(TARGET));
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it('refuses a manager editing another manager (403)', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: USER }, role: 'manager' });
    respond['clinic_users.select'] = { data: { id: 'm2', role: 'manager', deleted_at: null }, error: null };
    const res = await savePermissions(body({ view_overview: false }), ctx(TARGET));
    expect(res.status).toBe(403);
    expect(rpcCalls).toHaveLength(0);
  });

  it('returns 404 when the target is not an active member', async () => {
    respond['clinic_users.select'] = { data: null, error: null };
    const res = await savePermissions(body({ view_overview: true }), ctx(TARGET));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/clinic/team/[userId]/permissions', () => {
  it('lets a member read their own overrides', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: USER }, role: 'doctor' });
    respond['user_permissions.select'] = { data: [{ permission_key: 'view_leads', enabled: true }], error: null };
    const res = await getPermissions(req(`/api/clinic/team/${USER}/permissions?clinic_id=${CLINIC}`), ctx(USER));
    expect(res.status).toBe(200);
    expect((await res.json()).overrides).toHaveLength(1);
  });

  it('blocks a non-admin reading someone else overrides (403)', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: USER }, role: 'doctor' });
    const res = await getPermissions(req(`/api/clinic/team/${TARGET}/permissions?clinic_id=${CLINIC}`), ctx(TARGET));
    expect(res.status).toBe(403);
  });
});

describe('/api/clinic/roles', () => {
  const createBody = (payload: Record<string, unknown>) =>
    req('/api/clinic/roles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clinic_id: CLINIC, ...payload }),
    });

  it('lists the clinic custom roles', async () => {
    respond['custom_roles.select'] = { data: [{ id: 'r1', name: 'سكرتيرة متقدمة' }], error: null };
    const res = await listRoles(req(`/api/clinic/roles?clinic_id=${CLINIC}`));
    expect(res.status).toBe(200);
    expect((await res.json()).roles).toHaveLength(1);
  });

  it('creates a custom role with valid permissions (201)', async () => {
    respond['custom_roles.insert'] = {
      data: { id: 'r9', name: 'سكرتيرة متقدمة', permissions: ['view_leads'] },
      error: null,
    };
    const res = await createRole(createBody({ name: 'سكرتيرة متقدمة', permissions: ['view_leads'] }));
    expect(res.status).toBe(201);
    expect((await res.json()).role.id).toBe('r9');
  });

  it('rejects a reserved system role name (400)', async () => {
    const res = await createRole(createBody({ name: 'Manager', permissions: [] }));
    expect(res.status).toBe(400);
  });

  it('rejects unknown permission keys (400)', async () => {
    const res = await createRole(createBody({ name: 'دور تجريبي', permissions: ['nope'] }));
    expect(res.status).toBe(400);
  });

  it('rejects a non-admin caller (403)', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, user: { id: USER }, role: 'receptionist' });
    const res = await createRole(createBody({ name: 'دور تجريبي', permissions: [] }));
    expect(res.status).toBe(403);
  });

  it('PATCH updates a role', async () => {
    respond['custom_roles.update'] = { data: { id: 'r1', name: 'دور محدّث' }, error: null };
    const res = await patchRole(
      req('/api/clinic/roles/r1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clinic_id: CLINIC, name: 'دور محدّث' }),
      }),
      { params: { roleId: 'r1' } } as never
    );
    expect(res.status).toBe(200);
    expect((await res.json()).role.name).toBe('دور محدّث');
  });

  it('DELETE refuses while members still use the role (409)', async () => {
    respond['custom_roles.select'] = { data: { id: 'r1', name: 'سكرتيرة متقدمة', is_system: false }, error: null };
    respond['clinic_users.count'] = { data: null, error: null, count: 3 };
    const res = await deleteRole(req(`/api/clinic/roles/r1?clinic_id=${CLINIC}`, { method: 'DELETE' }), {
      params: { roleId: 'r1' },
    } as never);
    expect(res.status).toBe(409);
    expect((await res.json()).in_use).toBe(3);
  });

  it('DELETE removes an unused role', async () => {
    respond['custom_roles.select'] = { data: { id: 'r1', name: 'دور قديم', is_system: false }, error: null };
    respond['clinic_users.count'] = { data: null, error: null, count: 0 };
    respond['custom_roles.delete'] = { data: null, error: null };
    const res = await deleteRole(req(`/api/clinic/roles/r1?clinic_id=${CLINIC}`, { method: 'DELETE' }), {
      params: { roleId: 'r1' },
    } as never);
    expect(res.status).toBe(200);
  });

  it('DELETE refuses a system role (400)', async () => {
    respond['custom_roles.select'] = { data: { id: 'r1', name: 'نظامي', is_system: true }, error: null };
    const res = await deleteRole(req(`/api/clinic/roles/r1?clinic_id=${CLINIC}`, { method: 'DELETE' }), {
      params: { roleId: 'r1' },
    } as never);
    expect(res.status).toBe(400);
  });
});

