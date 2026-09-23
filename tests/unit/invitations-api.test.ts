import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TEAM INVITATIONS (#38) — API contract tests.
 *
 * Covers /api/clinic/invitations (create + list), the revoke route and the
 * public acceptance route: authorization, single-use/expiry, email binding,
 * entitlement gate and the token never leaking through the list.
 */

const mockAuth = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  roleDenied: vi.fn(() => null),
  ADMIN_ROLES: ['owner', 'manager'],
}));
vi.mock('@/lib/services/clinicAuthorization', () => mockAuth);

const mockLogging = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => mockLogging);

const mockAudit = vi.hoisted(() => ({ writeAuditLog: vi.fn(async (_entry: Record<string, unknown>) => undefined) }));
vi.mock('@/lib/services/auditService', () => mockAudit);

const mockEntitlements = vi.hoisted(() => ({
  assertEntitlement: vi.fn(async () => ({ allowed: true, limit: 10, used: 1 })),
  releaseEntitlement: vi.fn(async () => undefined),
  entitlementErrorResponse: vi.fn(() => null),
}));
vi.mock('@/lib/subscription/entitlements', () => mockEntitlements);

const mockSendInvitationEmail = vi.hoisted(() =>
  vi.fn(async (_params: unknown) => ({ sent: true, provider: 'resend', error: null }))
);
vi.mock('@/lib/communications/email/invitations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/communications/email/invitations')>();
  return { ...actual, sendInvitationEmail: mockSendInvitationEmail };
});

const mockSupabaseAuth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: mockSupabaseAuth } }));

type DbResult = { data?: unknown; error?: unknown };

// Per-table FIFO result queue + a fresh chainable builder per `from()` call, so
// each request's reads/writes are scripted in the order the route performs them
// (no cross-contamination between tables or tests).
const mockDb = vi.hoisted(() => {
  type Bucket = { results: DbResult[]; inserts: unknown[]; updates: unknown[]; selects: string[]; deletes: number };
  const tables: Record<string, Bucket> = {};
  const rpcResults: Record<string, DbResult[]> = {};
  const rpcCalls: Array<{ name: string; args: unknown }> = [];

  function bucket(table: string): Bucket {
    tables[table] = tables[table] ?? { results: [], inserts: [], updates: [], selects: [], deletes: 0 };
    return tables[table];
  }
  function nextResult(table: string): DbResult {
    const b = bucket(table);
    return b.results.length ? b.results.shift()! : { data: null, error: null };
  }
  function makeChain(table: string) {
    const b = bucket(table);
    const chain: Record<string, unknown> = {
      select: (columns?: string) => { b.selects.push(String(columns ?? '')); return chain; },
      insert: (payload: unknown) => { b.inserts.push(payload); return chain; },
      update: (payload: unknown) => { b.updates.push(payload); return chain; },
      delete: () => { b.deletes += 1; return chain; },
      eq: () => chain,
      neq: () => chain,
      is: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => nextResult(table),
      single: async () => nextResult(table),
      then: (resolve: (value: DbResult) => unknown) => Promise.resolve(nextResult(table)).then(resolve),
    };
    return chain;
  }

  const client = {
    from: (table: string) => makeChain(table),
    // RPCs (the 20261017 invitation functions) are scripted per function name so
    // a test can make `accept_invitation` lose a race, or `extend_invitation`
    // report the cap, without disturbing the table queues.
    rpc: vi.fn(async (name: string, args?: unknown) => {
      rpcCalls.push({ name, args });
      const queued = rpcResults[name];
      if (queued?.length) return queued.shift()!;
      return { data: null, error: null } as DbResult;
    }),
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
        createUser: vi.fn(async () => ({ data: { user: { id: 'new-user-1' } }, error: null })),
        deleteUser: vi.fn(async () => ({ error: null })),
        getUserById: vi.fn(async () => ({ data: { user: { email: null } }, error: null })),
      },
    },
  };

  return {
    client,
    queue(table: string, ...results: DbResult[]) {
      bucket(table).results.push(...results);
    },
    inserted(table: string) {
      return bucket(table).inserts;
    },
    updated(table: string) {
      return bucket(table).updates;
    },
    selected(table: string) {
      return bucket(table).selects;
    },
    deletedCount(table: string) {
      return bucket(table).deletes;
    },
    /** Scripts the Nth RPC response for a function, e.g. rpcQueue('accept_invitation', …). */
    rpcQueue(name: string, ...results: DbResult[]) {
      rpcResults[name] = rpcResults[name] ?? [];
      rpcResults[name].push(...results);
    },
    rpcCallsFor(name: string) {
      return rpcCalls.filter((call) => call.name === name);
    },
    rpcCallNames() {
      return rpcCalls.map((call) => call.name);
    },
    reset() {
      for (const key of Object.keys(tables)) delete tables[key];
      for (const key of Object.keys(rpcResults)) delete rpcResults[key];
      rpcCalls.length = 0;
      // mockReset (not clearAllMocks) also drops queued *Once implementations,
      // so a leftover once-value can never bleed into the next test.
      client.auth.admin.listUsers.mockReset();
      client.auth.admin.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
      client.auth.admin.createUser.mockReset();
      client.auth.admin.createUser.mockResolvedValue({ data: { user: { id: 'new-user-1' } }, error: null });
      client.auth.admin.deleteUser.mockReset();
      client.auth.admin.deleteUser.mockResolvedValue({ error: null });
    },
  };
});
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mockDb.client }));

import { POST as createInvitation, GET as listInvitations } from '@/app/api/clinic/invitations/route';
import { DELETE as revokeInvitation } from '@/app/api/clinic/invitations/[id]/route';
import { POST as extendInvitation } from '@/app/api/clinic/invitations/[id]/extend/route';
import { GET as expireInvitationsCron } from '@/app/api/cron/expire-invitations/route';
import { GET as previewInvitation, POST as acceptInvitation } from '@/app/api/invitations/accept/route';
import { buildInvitationUrl, renderInvitationEmail } from '@/lib/communications/email/invitations';

const CLINIC_A = '11111111-1111-1111-1111-111111111111';
const CLINIC_B = '22222222-2222-2222-2222-222222222222';
const INVITATION_ID = '33333333-3333-3333-3333-333333333333';
const TOKEN = 'a'.repeat(64);

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function jsonBody(data: unknown, method = 'POST'): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) };
}

function invitationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVITATION_ID,
    clinic_id: CLINIC_A,
    invited_email: 'doctor@example.com',
    role: 'staff',
    status: 'pending',
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    accepted_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.reset();
  mockAuth.authorizeClinicRequest.mockResolvedValue({
    authorized: true,
    user: { id: 'owner-1', email: 'owner@clinic.com' },
    role: 'owner',
  });
  mockAuth.roleDenied.mockReturnValue(null);
  mockEntitlements.assertEntitlement.mockResolvedValue({ allowed: true, limit: 10, used: 1 });
  mockEntitlements.entitlementErrorResponse.mockReturnValue(null);
  mockSendInvitationEmail.mockResolvedValue({ sent: true, provider: 'resend', error: null });
});

describe('POST /api/clinic/invitations', () => {
  it('requires clinic_id', async () => {
    const res = await createInvitation(makeRequest('http://localhost/api/clinic/invitations', jsonBody({ email: 'a@b.com' })));
    expect(res.status).toBe(400);
    expect(mockAuth.authorizeClinicRequest).not.toHaveBeenCalled();
  });

  it('rejects non-admin members (403)', async () => {
    mockAuth.roleDenied.mockReturnValue({ authorized: false, status: 403 });
    const res = await createInvitation(
      makeRequest(`http://localhost/api/clinic/invitations?clinic_id=${CLINIC_A}`, jsonBody({ email: 'a@b.com' }))
    );
    expect(res.status).toBe(403);
    expect(mockDb.inserted('invitations')).toHaveLength(0);
  });

  it('rejects an invalid email (400)', async () => {
    const res = await createInvitation(
      makeRequest(`http://localhost/api/clinic/invitations?clinic_id=${CLINIC_A}`, jsonBody({ email: 'not-an-email' }))
    );
    expect(res.status).toBe(400);
  });

  it('rejects inviting yourself (409)', async () => {
    const res = await createInvitation(
      makeRequest(`http://localhost/api/clinic/invitations?clinic_id=${CLINIC_A}`, jsonBody({ email: 'OWNER@clinic.com' }))
    );
    expect(res.status).toBe(409);
  });

  it('rejects an existing active member (409)', async () => {
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    mockDb.client.auth.admin.listUsers.mockResolvedValueOnce({
      data: { users: [{ id: 'member-1', email: 'Doctor@Example.com' }] },
      error: null,
    });
    mockDb.queue('clinic_users', { data: { id: 'm-1', deleted_at: null } });

    const res = await createInvitation(
      makeRequest(`http://localhost/api/clinic/invitations?clinic_id=${CLINIC_A}`, jsonBody({ email: 'doctor@example.com' }))
    );
    expect(res.status).toBe(409);
    expect(mockDb.inserted('invitations')).toHaveLength(0);
  });

  it('rejects a duplicate pending invitation (409)', async () => {
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    mockDb.queue('invitations', { data: { id: 'pending-1', expires_at: new Date().toISOString() } });

    const res = await createInvitation(
      makeRequest(`http://localhost/api/clinic/invitations?clinic_id=${CLINIC_A}`, jsonBody({ email: 'doctor@example.com' }))
    );
    expect(res.status).toBe(409);
    expect(mockDb.inserted('invitations')).toHaveLength(0);
  });

  it('creates the invitation, emails the link and audits it (201)', async () => {
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    mockDb.queue('invitations', { data: null }, { data: invitationRow() });

    const res = await createInvitation(
      makeRequest(`http://localhost/api/clinic/invitations?clinic_id=${CLINIC_A}`, jsonBody({ email: 'Doctor@Example.com', role: 'doctor' }))
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.email_sent).toBe(true);
    expect(body.invitation.invited_email).toBe('doctor@example.com');

    // The raw token is generated server-side (32 bytes hex) and only ever
    // travels inside the invitation link.
    const insert = mockDb.inserted('invitations')[0] as Record<string, unknown>;
    expect(insert.role).toBe('doctor');
    expect(insert.status).toBe('pending');
    expect(String(insert.token)).toMatch(/^[a-f0-9]{64}$/);
    expect(body.invite_url).toBe(buildInvitationUrl('http://localhost:3000', String(insert.token)));

    expect(mockSendInvitationEmail).toHaveBeenCalledTimes(1);
    expect(mockSendInvitationEmail.mock.calls[0][0]).toMatchObject({
      to: 'doctor@example.com',
      clinicName: 'عيادة أ',
      role: 'doctor',
      token: insert.token,
    });
    expect(mockAudit.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'invitation.create', clinicId: CLINIC_A })
    );
  });

  it('still returns the link when email delivery fails (201, email_sent=false)', async () => {
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    mockDb.queue('invitations', { data: null }, { data: invitationRow() });
    // sendInvitationEmail never throws any more — it reports the failure, so the
    // admin still gets the link instead of a false "تم الإرسال".
    mockSendInvitationEmail.mockResolvedValueOnce({
      sent: false,
      provider: 'resend',
      error: 'Resend API error (401)',
    });

    const res = await createInvitation(
      makeRequest(`http://localhost/api/clinic/invitations?clinic_id=${CLINIC_A}`, jsonBody({ email: 'doctor@example.com' }))
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.email_sent).toBe(false);
    expect(body.email_provider).toBe('resend');
    expect(body.email_error).toBe('Resend API error (401)');
    expect(body.expires_in_hours).toBe(24);
    expect(body.invite_url).toContain('/invite/');
  });

  it('reports NOT_CONFIGURED when no email provider is set, and still returns the link', async () => {
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    mockDb.queue('invitations', { data: null }, { data: invitationRow() });
    mockSendInvitationEmail.mockResolvedValueOnce({
      sent: false,
      provider: 'noop',
      error: 'EMAIL_PROVIDER_NOT_CONFIGURED',
    });

    const res = await createInvitation(
      makeRequest(`http://localhost/api/clinic/invitations?clinic_id=${CLINIC_A}`, jsonBody({ email: 'doctor@example.com' }))
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.email_sent).toBe(false);
    expect(body.email_error).toBe('EMAIL_PROVIDER_NOT_CONFIGURED');
    expect(body.invite_url).toContain('/invite/');
    // The audit trail records the delivery outcome, never the token.
    const auditCall = mockAudit.writeAuditLog.mock.calls.at(-1)?.[0];
    expect(auditCall?.metadata).toMatchObject({ email_sent: false, email_provider: 'noop' });
    expect(JSON.stringify(auditCall ?? {})).not.toContain('token');
  });
});


describe('GET /api/clinic/invitations', () => {
  it('lists pending invitations without leaking the token', async () => {
    mockDb.queue('invitations', {
      data: [
        invitationRow({ token: TOKEN }),
        invitationRow({ id: 'inv-expired', expires_at: new Date(Date.now() - 1000).toISOString() }),
      ],
    });

    const res = await listInvitations(makeRequest(`http://localhost/api/clinic/invitations?clinic_id=${CLINIC_A}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    // The projection itself must exclude the token (the mock returns the row as
    // supplied, so the SELECT list is the real guarantee).
    expect(mockDb.selected('invitations')[0]).not.toContain('token');
    expect(body.data[0].is_expired).toBe(false);
    expect(body.data[1].is_expired).toBe(true);
  });

  it('is admin-only (403)', async () => {
    mockAuth.roleDenied.mockReturnValue({ authorized: false, status: 403 });
    const res = await listInvitations(makeRequest(`http://localhost/api/clinic/invitations?clinic_id=${CLINIC_A}`));
    expect(res.status).toBe(403);
  });

  it('falls back to the legacy projection when the new columns are missing (pre-migration)', async () => {
    mockDb.queue(
      'invitations',
      { data: null, error: { code: '42703', message: 'column invitations.session_expires_at does not exist' } },
      { data: [invitationRow()] }
    );

    const res = await listInvitations(makeRequest(`http://localhost/api/clinic/invitations?clinic_id=${CLINIC_A}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    // The legacy projection still omits the token, and the derived fields survive.
    expect(mockDb.selected('invitations')).toHaveLength(2);
    expect(mockDb.selected('invitations')[1]).not.toContain('token');
    expect(body.data[0].is_expired).toBe(false);
    expect(body.data[0].session_active).toBe(false);
  });
});

describe('DELETE /api/clinic/invitations/{id}', () => {
  it('revokes a pending invitation in the authorized clinic', async () => {
    mockDb.queue('invitations', { data: { id: INVITATION_ID, status: 'pending' } });

    const res = await revokeInvitation(
      makeRequest(`http://localhost/api/clinic/invitations/${INVITATION_ID}?clinic_id=${CLINIC_A}`, { method: 'DELETE' }),
      { params: { id: INVITATION_ID } }
    );

    expect(res.status).toBe(200);
    expect(mockDb.updated('invitations')[0]).toMatchObject({ status: 'revoked' });
    expect(mockAudit.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'invitation.revoke' }));
  });

  it('404s for an invitation of another clinic', async () => {
    mockDb.queue('invitations', { data: null });

    const res = await revokeInvitation(
      makeRequest(`http://localhost/api/clinic/invitations/${INVITATION_ID}?clinic_id=${CLINIC_B}`, { method: 'DELETE' }),
      { params: { id: INVITATION_ID } }
    );

    expect(res.status).toBe(404);
    expect(mockDb.updated('invitations')).toHaveLength(0);
  });

  it('409s when the invitation is no longer pending', async () => {
    mockDb.queue('invitations', { data: { id: INVITATION_ID, status: 'accepted' } });

    const res = await revokeInvitation(
      makeRequest(`http://localhost/api/clinic/invitations/${INVITATION_ID}?clinic_id=${CLINIC_A}`, { method: 'DELETE' }),
      { params: { id: INVITATION_ID } }
    );

    expect(res.status).toBe(409);
  });
});


describe('GET /api/invitations/accept (preview)', () => {
  it('rejects a malformed token (400)', async () => {
    const res = await previewInvitation(makeRequest('http://localhost/api/invitations/accept?token=short'));
    expect(res.status).toBe(400);
  });

  it('404s for an unknown token', async () => {
    mockDb.queue('invitations', { data: null });
    const res = await previewInvitation(makeRequest(`http://localhost/api/invitations/accept?token=${TOKEN}`));
    expect(res.status).toBe(404);
  });

  it('returns a masked preview and flags an existing account', async () => {
    mockDb.queue('invitations', { data: invitationRow() });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    mockDb.client.auth.admin.listUsers.mockResolvedValueOnce({
      data: { users: [{ id: 'member-1', email: 'doctor@example.com' }] },
      error: null,
    });

    const res = await previewInvitation(makeRequest(`http://localhost/api/invitations/accept?token=${TOKEN}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invitation.status).toBe('pending');
    expect(body.invitation.has_account).toBe(true);
    expect(body.invitation.email_masked).toBe('d*****@example.com');
    expect(body.invitation.email_masked).not.toContain('doctor@');
    expect(body.invitation.role_label).toBe('موظف');
  });

  it('reports an expired invitation as expired (no account probe)', async () => {
    mockDb.queue('invitations', {
      data: invitationRow({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
    });

    const res = await previewInvitation(makeRequest(`http://localhost/api/invitations/accept?token=${TOKEN}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invitation.status).toBe('expired');
    expect(body.invitation.has_account).toBe(false);
    expect(body.invitation.session_valid_until).toBeNull();
    expect(mockDb.client.auth.admin.listUsers).not.toHaveBeenCalled();
    // A dead link must never (re)start a 30-minute session.
    expect(mockDb.rpcCallNames()).not.toContain('open_invitation');
  });

  it('starts the 30-minute opening session and returns its deadline', async () => {
    const sessionUntil = new Date(Date.now() + 30 * 60_000).toISOString();
    mockDb.queue('invitations', { data: invitationRow() });
    mockDb.rpcQueue('open_invitation', { data: [{ session_valid_until: sessionUntil, was_reopened: false }], error: null });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });

    const res = await previewInvitation(makeRequest(`http://localhost/api/invitations/accept?token=${TOKEN}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invitation.session_valid_until).toBe(sessionUntil);
    expect(body.invitation.session_minutes).toBe(30);
    expect(mockDb.rpcCallsFor('open_invitation')[0].args).toMatchObject({ p_token: TOKEN });
  });

  it('still renders the preview when the session cannot be started (RPC error)', async () => {
    mockDb.queue('invitations', { data: invitationRow() });
    mockDb.rpcQueue('open_invitation', { data: null, error: { message: 'INVITATION_INVALID' } });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });

    const res = await previewInvitation(makeRequest(`http://localhost/api/invitations/accept?token=${TOKEN}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invitation.session_valid_until).toBeNull();
    expect(body.invitation.clinic_name).toBe('عيادة أ');
    expect(mockLogging.logEvent).toHaveBeenCalledWith(
      'invitation_session_error',
      expect.objectContaining({ error: 'INVITATION_INVALID' }),
      'error'
    );
  });

  it('reads the invitation through the legacy projection before the migration is applied', async () => {
    mockDb.queue(
      'invitations',
      { data: null, error: { code: '42703', message: 'column invitations.session_expires_at does not exist' } },
      { data: invitationRow() }
    );
    // The session RPC is not deployed either — the preview must still work.
    mockDb.rpcQueue('open_invitation', {
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.open_invitation' },
    });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });

    const res = await previewInvitation(makeRequest(`http://localhost/api/invitations/accept?token=${TOKEN}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invitation.status).toBe('pending');
    expect(body.invitation.session_valid_until).toBeNull();
    expect(mockDb.selected('invitations')).toHaveLength(2);
    expect(mockLogging.logEvent).toHaveBeenCalledWith(
      'invitation_lookup_legacy_projection',
      expect.anything()
    );
  });
});

describe('POST /api/invitations/accept', () => {
  it('401s when neither a session nor a password is supplied', async () => {
    mockDb.queue('invitations', { data: invitationRow() });
    const res = await acceptInvitation(
      makeRequest('http://localhost/api/invitations/accept', jsonBody({ token: TOKEN }))
    );
    expect(res.status).toBe(401);
  });

  it('404s for an unknown token', async () => {
    mockDb.queue('invitations', { data: null });
    const res = await acceptInvitation(
      makeRequest('http://localhost/api/invitations/accept', jsonBody({ token: TOKEN, password: 'secret123' }))
    );
    expect(res.status).toBe(404);
  });

  it('410s for an expired invitation', async () => {
    mockDb.queue('invitations', {
      data: invitationRow({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
    });
    const res = await acceptInvitation(
      makeRequest('http://localhost/api/invitations/accept', jsonBody({ token: TOKEN, password: 'secret123' }))
    );
    expect(res.status).toBe(410);
    expect(mockDb.client.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('409s for an already accepted invitation', async () => {
    mockDb.queue('invitations', { data: invitationRow({ status: 'accepted' }) });
    const res = await acceptInvitation(
      makeRequest('http://localhost/api/invitations/accept', jsonBody({ token: TOKEN, password: 'secret123' }))
    );
    expect(res.status).toBe(409);
  });

  it('400s when the invitation carries an unknown role (fail closed)', async () => {
    mockDb.queue('invitations', { data: invitationRow({ role: 'root' }) });
    const res = await acceptInvitation(
      makeRequest('http://localhost/api/invitations/accept', jsonBody({ token: TOKEN, password: 'secret123' }))
    );
    expect(res.status).toBe(400);
    expect(mockDb.inserted('clinic_users')).toHaveLength(0);
  });

  it('403s when the signed-in email differs from the invited email', async () => {
    mockDb.queue('invitations', { data: invitationRow() });
    mockSupabaseAuth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-9', email: 'someone.else@example.com' } },
      error: null,
    });

    const res = await acceptInvitation(
      makeRequest('http://localhost/api/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ token: TOKEN }),
      })
    );

    expect(res.status).toBe(403);
    expect(mockDb.inserted('clinic_users')).toHaveLength(0);
    expect(mockDb.updated('invitations')).toHaveLength(0);
  });
});


describe('POST /api/invitations/accept — joining', () => {
  function acceptWithSession() {
    return acceptInvitation(
      makeRequest('http://localhost/api/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ token: TOKEN }),
      })
    );
  }

  it('joins an authenticated invitee and consumes the invitation atomically (200)', async () => {
    mockDb.queue('invitations', { data: invitationRow() });
    mockDb.queue('clinic_users', { data: null }, { data: { id: 'm-1' } });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    mockSupabaseAuth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-9', email: 'Doctor@Example.com' } },
      error: null,
    });

    const res = await acceptWithSession();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.accepted).toBe(true);
    expect(body.data.created_account).toBe(false);
    expect(body.data.clinic.slug).toBe('clinic-a');
    // An existing account never gets its email echoed back.
    expect(body.data.invited_email).toBeUndefined();

    expect(mockDb.inserted('clinic_users')[0]).toMatchObject({
      clinic_id: CLINIC_A,
      user_id: 'user-9',
      role: 'staff',
    });
    // The consume is the DB function (row lock + status/expiry/mailbox re-check),
    // not a plain UPDATE.
    expect(mockDb.rpcCallsFor('accept_invitation')).toHaveLength(1);
    expect(mockDb.rpcCallsFor('accept_invitation')[0].args).toMatchObject({ p_token: TOKEN, p_user_id: 'user-9' });
    expect(mockDb.updated('invitations')).toHaveLength(0);
    expect(mockAudit.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'invitation.accept' }));
  });

  it('creates the account for a new mailbox and returns it for immediate sign-in (200)', async () => {
    mockDb.queue('invitations', { data: invitationRow() });
    mockDb.queue('clinic_users', { data: null }, { data: { id: 'm-2' } });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    mockDb.client.auth.admin.createUser.mockResolvedValueOnce({
      data: { user: { id: 'new-user-1' } },
      error: null,
    });

    const res = await acceptInvitation(
      makeRequest('http://localhost/api/invitations/accept', jsonBody({ token: TOKEN, password: 'secret123' }))
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.created_account).toBe(true);
    expect(body.data.invited_email).toBe('doctor@example.com');
    expect(mockDb.client.auth.admin.createUser).toHaveBeenCalledWith({
      email: 'doctor@example.com',
      password: 'secret123',
      email_confirm: true,
    });
    expect(mockDb.inserted('clinic_users')[0]).toMatchObject({ user_id: 'new-user-1', role: 'staff' });
  });

  it('409s on the password path when an account already exists', async () => {
    mockDb.queue('invitations', { data: invitationRow() });
    mockDb.client.auth.admin.listUsers.mockResolvedValueOnce({
      data: { users: [{ id: 'existing-1', email: 'doctor@example.com' }] },
      error: null,
    });

    const res = await acceptInvitation(
      makeRequest('http://localhost/api/invitations/accept', jsonBody({ token: TOKEN, password: 'secret123' }))
    );

    expect(res.status).toBe(409);
    expect(mockDb.client.auth.admin.createUser).not.toHaveBeenCalled();
    expect(mockDb.inserted('clinic_users')).toHaveLength(0);
  });

  it('rolls the membership back when another request consumed the invitation first (409)', async () => {
    mockDb.queue('invitations', { data: invitationRow() });
    mockDb.queue('clinic_users', { data: null }, { data: { id: 'm-3' } });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    // The DB function is the one that decides the race: the loser gets ALREADY_ACCEPTED.
    mockDb.rpcQueue('accept_invitation', { data: null, error: { message: 'ALREADY_ACCEPTED' } });
    mockSupabaseAuth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-9', email: 'doctor@example.com' } },
      error: null,
    });

    const res = await acceptWithSession();

    expect(res.status).toBe(409);
    expect(mockDb.deletedCount('clinic_users')).toBe(1);
    expect(mockEntitlements.releaseEntitlement).toHaveBeenCalledWith(CLINIC_A, 'users');
  });

  it('maps a SQL EMAIL_MISMATCH to 403 and compensates the membership', async () => {
    mockDb.queue('invitations', { data: invitationRow() });
    mockDb.queue('clinic_users', { data: null }, { data: { id: 'm-4' } });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    // Route-level binding passes (same mailbox), the DB re-check rejects.
    mockDb.rpcQueue('accept_invitation', { data: null, error: { message: 'EMAIL_MISMATCH' } });
    mockSupabaseAuth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-9', email: 'doctor@example.com' } },
      error: null,
    });

    const res = await acceptWithSession();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('هذه الدعوة مرتبطة ببريد آخر');
    expect(mockDb.deletedCount('clinic_users')).toBe(1);
  });

  it('maps a SQL INVITATION_EXPIRED to 410', async () => {
    mockDb.queue('invitations', { data: invitationRow() });
    mockDb.queue('clinic_users', { data: null }, { data: { id: 'm-5' } });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    mockDb.rpcQueue('accept_invitation', { data: null, error: { message: 'INVITATION_EXPIRED' } });
    mockSupabaseAuth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-9', email: 'doctor@example.com' } },
      error: null,
    });

    const res = await acceptWithSession();

    expect(res.status).toBe(410);
    expect(mockDb.deletedCount('clinic_users')).toBe(1);
  });

  it('falls back to the guarded UPDATE when the RPC is not deployed yet (PGRST202)', async () => {
    mockDb.queue('invitations', { data: invitationRow() }, { data: { id: INVITATION_ID } });
    mockDb.queue('clinic_users', { data: null }, { data: { id: 'm-9' } });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    // Deploy-order safety: code shipped before migration 20261017.
    mockDb.rpcQueue('accept_invitation', {
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.accept_invitation' },
    });
    mockSupabaseAuth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-9', email: 'doctor@example.com' } },
      error: null,
    });

    const res = await acceptWithSession();

    expect(res.status).toBe(200);
    expect(mockDb.updated('invitations')[0]).toMatchObject({
      status: 'accepted',
      accepted_by: 'user-9',
      accept_count: 1,
    });
    expect(mockLogging.logEvent).toHaveBeenCalledWith(
      'invitation_rpc_missing_fallback',
      expect.objectContaining({ rpc: 'accept_invitation', code: 'PGRST202' }),
      'error'
    );
  });

  it('legacy fallback retries without accept_count on a pre-migration schema (42703)', async () => {
    mockDb.queue(
      'invitations',
      { data: invitationRow() },
      { data: null, error: { code: '42703', message: 'column invitations.accept_count does not exist' } },
      { data: { id: INVITATION_ID } }
    );
    mockDb.queue('clinic_users', { data: null }, { data: { id: 'm-10' } });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    mockDb.rpcQueue('accept_invitation', { data: null, error: { code: 'PGRST202', message: 'no function' } });
    mockSupabaseAuth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-9', email: 'doctor@example.com' } },
      error: null,
    });

    const res = await acceptWithSession();

    expect(res.status).toBe(200);
    expect(mockDb.updated('invitations')).toHaveLength(2);
    expect(mockDb.updated('invitations')[1]).toMatchObject({ status: 'accepted' });
    expect(mockDb.updated('invitations')[1]).not.toHaveProperty('accept_count');
  });

  it('blocks acceptance when the users entitlement is reached (402)', async () => {
    const { NextResponse } = await import('next/server');
    mockDb.queue('invitations', { data: invitationRow() });
    mockDb.queue('clinic_users', { data: null });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    mockSupabaseAuth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-9', email: 'doctor@example.com' } },
      error: null,
    });
    mockEntitlements.assertEntitlement.mockRejectedValueOnce(new Error('limit'));
    mockEntitlements.entitlementErrorResponse.mockReturnValueOnce(
      NextResponse.json({ error: 'ENTITLEMENT_LIMIT_REACHED', resource: 'users' }, { status: 402 })
    );

    const res = await acceptWithSession();

    expect(res.status).toBe(402);
    expect(mockDb.inserted('clinic_users')).toHaveLength(0);
  });
});

describe('POST /api/clinic/invitations/{id}/extend (owner/manager only)', () => {
  function extendRequest(body: unknown = { hours: 24 }, query = `clinic_id=${CLINIC_A}`) {
    return makeRequest(
      `http://localhost/api/clinic/invitations/${INVITATION_ID}/extend?${query}`,
      jsonBody(body)
    );
  }

  it('requires clinic_id (400)', async () => {
    const res = await extendInvitation(extendRequest({}, ''), { params: { id: INVITATION_ID } });
    expect(res.status).toBe(400);
    expect(mockAuth.authorizeClinicRequest).not.toHaveBeenCalled();
  });

  it('rejects a non-admin member (403) without touching the DB', async () => {
    mockAuth.roleDenied.mockReturnValue({ authorized: false, status: 403 });
    const res = await extendInvitation(extendRequest(), { params: { id: INVITATION_ID } });
    expect(res.status).toBe(403);
    expect(mockDb.rpcCallNames()).toHaveLength(0);
  });

  it('extends a pending invitation and audits it (200)', async () => {
    const newExpiry = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    mockDb.rpcQueue('extend_invitation', {
      data: [{ id: INVITATION_ID, expires_at: newExpiry, extend_count: 1, status: 'pending' }],
      error: null,
    });

    const res = await extendInvitation(extendRequest(), { params: { id: INVITATION_ID } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({
      id: INVITATION_ID,
      expires_at: newExpiry,
      extend_count: 1,
      max_extensions: 3,
    });

    // The actor identity is passed INTO the transaction: the SQL function
    // re-checks the role, so a forged direct call cannot extend.
    expect(mockDb.rpcCallsFor('extend_invitation')[0].args).toMatchObject({
      p_invitation_id: INVITATION_ID,
      p_clinic_id: CLINIC_A,
      p_actor_user_id: 'owner-1',
      p_hours: 24,
      p_max_extends: 3,
    });
    expect(mockAudit.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'invitation.extend', clinicId: CLINIC_A })
    );
  });

  it('defaults to 24 hours when the body is missing', async () => {
    mockDb.rpcQueue('extend_invitation', { data: [{ id: INVITATION_ID, extend_count: 1 }], error: null });

    const res = await extendInvitation(
      makeRequest(`http://localhost/api/clinic/invitations/${INVITATION_ID}/extend?clinic_id=${CLINIC_A}`, {
        method: 'POST',
      }),
      { params: { id: INVITATION_ID } }
    );

    expect(res.status).toBe(200);
    expect(mockDb.rpcCallsFor('extend_invitation')[0].args).toMatchObject({ p_hours: 24 });
  });

  it('409s once the extension cap is reached', async () => {
    mockDb.rpcQueue('extend_invitation', { data: null, error: { message: 'MAX_EXTENDS_REACHED' } });

    const res = await extendInvitation(extendRequest(), { params: { id: INVITATION_ID } });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain('التمديدات');
    expect(body.detail).toBe('MAX_EXTENDS_REACHED');
    expect(mockAudit.writeAuditLog).not.toHaveBeenCalled();
  });

  it('409s for an invitation that is no longer pending', async () => {
    mockDb.rpcQueue('extend_invitation', { data: null, error: { message: 'NOT_PENDING' } });

    const res = await extendInvitation(extendRequest(), { params: { id: INVITATION_ID } });

    expect(res.status).toBe(409);
  });

  it('403s when the SQL function itself refuses the actor (defense in depth)', async () => {
    mockDb.rpcQueue('extend_invitation', { data: null, error: { message: 'Unauthorized' } });

    const res = await extendInvitation(extendRequest(), { params: { id: INVITATION_ID } });

    expect(res.status).toBe(403);
  });

  it('503s while the function is not deployed yet (pre-migration)', async () => {
    mockDb.rpcQueue('extend_invitation', {
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.extend_invitation' },
    });

    const res = await extendInvitation(extendRequest(), { params: { id: INVITATION_ID } });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.detail).toBe('RPC_NOT_DEPLOYED');
    expect(mockLogging.logEvent).toHaveBeenCalledWith(
      'team_invitation_extend_unavailable',
      expect.objectContaining({ clinic_id: CLINIC_A }),
      'error'
    );
  });
});

describe('GET /api/cron/expire-invitations', () => {
  function cronRequest(token?: string) {
    return makeRequest(
      'http://localhost/api/cron/expire-invitations',
      token ? { headers: { authorization: `Bearer ${token}` } } : undefined
    );
  }

  /** Runs `fn` with CRON_SECRET set, then restores whatever the env had. */
  async function withCronSecret(secret: string, fn: () => Promise<void>) {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = secret;
    try {
      await fn();
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  }

  it('401s on a wrong secret and never touches the database', async () => {
    await withCronSecret('cron-secret', async () => {
      const res = await expireInvitationsCron(cronRequest('not-the-secret'));
      expect(res.status).toBe(401);
      expect(mockDb.rpcCallNames()).toHaveLength(0);
    });
  });

  it('401s when the secret is configured but the header is missing', async () => {
    await withCronSecret('cron-secret', async () => {
      const res = await expireInvitationsCron(cronRequest());
      expect(res.status).toBe(401);
    });
  });

  it('expires stale invitations and reports how many were swept', async () => {
    await withCronSecret('cron-secret', async () => {
      mockDb.rpcQueue('expire_stale_invitations', { data: 4, error: null });

      const res = await expireInvitationsCron(cronRequest('cron-secret'));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.expired).toBe(4);
      expect(mockDb.rpcCallsFor('expire_stale_invitations')).toHaveLength(1);
      expect(mockLogging.logEvent).toHaveBeenCalledWith('invitation_expiry_sweep', { expired: 4 });
    });
  });

  it('500s and logs when the sweep fails', async () => {
    await withCronSecret('cron-secret', async () => {
      mockDb.rpcQueue('expire_stale_invitations', { data: null, error: { message: 'boom', code: 'P0001' } });

      const res = await expireInvitationsCron(cronRequest('cron-secret'));

      expect(res.status).toBe(500);
      expect(mockLogging.logEvent).toHaveBeenCalledWith(
        'invitation_expiry_sweep_error',
        expect.objectContaining({ error: 'boom' }),
        'error'
      );
    });
  });
});

describe('invitation email', () => {
  it('builds the acceptance URL under /invite', () => {
    expect(buildInvitationUrl('https://app.example.com', TOKEN)).toBe(`https://app.example.com/invite/${TOKEN}`);
  });

  it('renders an Arabic message with the link and escapes clinic names', () => {
    const message = renderInvitationEmail(
      {
        to: 'doctor@example.com',
        clinicName: 'عيادة <b>أ</b>',
        invitedBy: 'owner@clinic.com',
        role: 'doctor',
        token: TOKEN,
        expiresIn: '7 أيام',
      },
      'https://app.example.com'
    );

    expect(message.to).toBe('doctor@example.com');
    expect(message.subject).toContain('عيادة <b>أ</b>');
    expect(message.text).toContain(`https://app.example.com/invite/${TOKEN}`);
    expect(message.text).toContain('طبيب');
    expect(message.html).toContain('&lt;b&gt;أ&lt;/b&gt;');
  });
});

