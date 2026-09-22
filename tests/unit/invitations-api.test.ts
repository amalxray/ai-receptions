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

const mockAudit = vi.hoisted(() => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/services/auditService', () => mockAudit);

const mockEntitlements = vi.hoisted(() => ({
  assertEntitlement: vi.fn(async () => ({ allowed: true, limit: 10, used: 1 })),
  releaseEntitlement: vi.fn(async () => undefined),
  entitlementErrorResponse: vi.fn(() => null),
}));
vi.mock('@/lib/subscription/entitlements', () => mockEntitlements);

const mockSendInvitationEmail = vi.hoisted(() => vi.fn(async (_params: unknown) => undefined));
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
    rpc: vi.fn(async () => ({ data: { allowed: true, used: 1, limit: 10 }, error: null })),
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
    reset() {
      for (const key of Object.keys(tables)) delete tables[key];
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
  mockSendInvitationEmail.mockResolvedValue(undefined);
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
    mockSendInvitationEmail.mockRejectedValueOnce(new Error('smtp down'));

    const res = await createInvitation(
      makeRequest(`http://localhost/api/clinic/invitations?clinic_id=${CLINIC_A}`, jsonBody({ email: 'doctor@example.com' }))
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.email_sent).toBe(false);
    expect(body.invite_url).toContain('/invite/');
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
    expect(mockDb.client.auth.admin.listUsers).not.toHaveBeenCalled();
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

  it('joins an authenticated invitee and consumes the invitation (200)', async () => {
    mockDb.queue('invitations', { data: invitationRow() }, { data: { id: INVITATION_ID } });
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
    expect(mockDb.updated('invitations')[0]).toMatchObject({ status: 'accepted', accepted_by: 'user-9' });
    expect(mockAudit.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'invitation.accept' }));
  });

  it('creates the account for a new mailbox and returns it for immediate sign-in (200)', async () => {
    mockDb.queue('invitations', { data: invitationRow() }, { data: { id: INVITATION_ID } });
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
    mockDb.queue('invitations', { data: invitationRow() }, { data: null });
    mockDb.queue('clinic_users', { data: null }, { data: { id: 'm-3' } });
    mockDb.queue('clinics', { data: { id: CLINIC_A, name: 'عيادة أ', slug: 'clinic-a' } });
    mockSupabaseAuth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-9', email: 'doctor@example.com' } },
      error: null,
    });

    const res = await acceptWithSession();

    expect(res.status).toBe(409);
    expect(mockDb.deletedCount('clinic_users')).toBe(1);
    expect(mockEntitlements.releaseEntitlement).toHaveBeenCalledWith(CLINIC_A, 'users');
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

