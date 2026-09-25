import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * POST /api/clinic/add-subdomain — tenant host provisioning endpoint.
 *
 * Two contracts are covered here, both of them regression guards:
 *   1. AUTHORIZATION/tenancy: only an owner/manager of THAT clinic may register
 *      the host, and only for the clinic's own slug (a member of one tenant must
 *      never be able to claim another tenant's host).
 *   2. PERSISTENCE (P1): the outcome is written to `clinics.settings.tenant` —
 *      `active` on success (clearing any stale error) and `failed` + message on
 *      failure — and the readiness cache is dropped so the dashboard and the
 *      redirect decision see the new state immediately instead of 60s later.
 */

const mockAuth = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  roleDenied: vi.fn((): { status: number } | null => null),
  ADMIN_ROLES: ['owner', 'manager'],
  DATA_ROLES: ['owner', 'manager', 'doctor', 'receptionist'],
}));
vi.mock('@/lib/services/clinicAuthorization', () => mockAuth);

const mockLogging = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => mockLogging);

const mockState = vi.hoisted(() => ({
  clinicRow: null as { id: string; slug: string } | null,
  addResult: null as Record<string, unknown> | null,
  persistReturn: true,
  persisted: [] as Array<{ clinicId: string; patch: Record<string, unknown> }>,
  clearCalls: 0,
}));

// Only the Vercel WRITE is mocked; the slug/domain rules stay real so the test
// exercises the actual validation (reserved labels, DNS-label rules).
vi.mock('@/lib/vercel/domains', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vercel/domains')>();
  return {
    ...actual,
    addClinicSubdomain: vi.fn(async () => mockState.addResult),
  };
});

vi.mock('@/lib/vercel/subdomainReadiness', () => ({
  clearVercelDomainsCache: vi.fn(() => {
    mockState.clearCalls += 1;
  }),
}));

vi.mock('@/lib/services/clinicProvisioning', () => ({
  persistClinicProvisioning: vi.fn(async (clinicId: string, patch: Record<string, unknown>) => {
    mockState.persisted.push({ clinicId, patch });
    return mockState.persistReturn;
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.is = () => chain;
      chain.maybeSingle = async () => ({ data: mockState.clinicRow, error: null });
      return chain;
    }),
  },
}));

import { POST } from '@/app/api/clinic/add-subdomain/route';

const CLINIC_ID = '11111111-1111-1111-1111-111111111111';
const SLUG = 'demo-clinic';

function postRequest(body: unknown): Request {
  return new Request('https://www.dentairec.com/api/clinic/add-subdomain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/clinic/add-subdomain — tenancy + provisioning persistence (P1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.clinicRow = { id: CLINIC_ID, slug: SLUG };
    mockState.addResult = {
      success: true,
      domain: `${SLUG}.dentairec.com`,
      verified: true,
      alreadyExisted: false,
    };
    mockState.persistReturn = true;
    mockState.persisted = [];
    mockState.clearCalls = 0;
    mockAuth.roleDenied.mockReturnValue(null);
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: true, role: 'owner' });
  });

  it('rejects a non-admin member before touching Vercel or the DB settings', async () => {
    mockAuth.roleDenied.mockReturnValueOnce({ status: 403 });

    const res = await POST(postRequest({ clinic_id: CLINIC_ID, slug: SLUG }));

    expect(res.status).toBe(403);
    expect(mockState.persisted).toEqual([]);
    expect(mockState.clearCalls).toBe(0);
  });

  it('refuses to register a host for a slug the caller’s clinic does not own', async () => {
    // Authorized for CLINIC_ID, but asking for another tenant's label.
    const res = await POST(postRequest({ clinic_id: CLINIC_ID, slug: 'someone-else' }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'slug_mismatch' });
    expect(mockState.persisted).toEqual([]);
  });

  it('rejects an invalid or reserved label (400) without any Vercel call', async () => {
    const reserved = await POST(postRequest({ clinic_id: CLINIC_ID, slug: 'www' }));
    expect(reserved.status).toBe(400);
    await expect(reserved.json()).resolves.toMatchObject({ code: 'invalid_slug' });

    const invalid = await POST(postRequest({ clinic_id: CLINIC_ID, slug: 'Bad_Slug!' }));
    expect(invalid.status).toBe(400);

    expect(mockState.persisted).toEqual([]);
    expect(mockState.clearCalls).toBe(0);
  });

  it('records `active` in settings.tenant and drops the readiness cache on success', async () => {
    const res = await POST(postRequest({ clinic_id: CLINIC_ID, slug: SLUG }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      domain: `${SLUG}.dentairec.com`,
      persisted: true,
      subdomain_status: 'active',
    });

    expect(mockState.persisted).toEqual([
      {
        clinicId: CLINIC_ID,
        // `subdomain_error: undefined` is the deliberate stale-error clear.
        patch: { subdomain: `${SLUG}.dentairec.com`, subdomain_status: 'active', subdomain_error: undefined },
      },
    ]);
    // The verdict changed — the cached listing must not survive into the
    // dashboard/redirect decision.
    expect(mockState.clearCalls).toBe(1);
  });

  it('records `failed` + the reason and answers 502 when provisioning fails', async () => {
    mockState.addResult = { success: false, error: 'domain_already_in_use', code: 'conflict' };

    const res = await POST(postRequest({ clinic_id: CLINIC_ID, slug: SLUG }));

    expect(res.status).toBe(502);
    expect(mockState.persisted).toEqual([
      { clinicId: CLINIC_ID, patch: { subdomain_status: 'failed', subdomain_error: 'domain_already_in_use' } },
    ]);
    expect(mockState.clearCalls).toBe(1);
  });

  it('still reports the provisioning outcome when persistence itself fails', async () => {
    // Best-effort persistence: a settings write failure must never mask the
    // real Vercel answer (the owner would see "nothing happened").
    mockState.persistReturn = false;

    const res = await POST(postRequest({ clinic_id: CLINIC_ID, slug: SLUG }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, persisted: false });
  });

  it('requires clinic_id and slug', async () => {
    const res = await POST(postRequest({ slug: SLUG }));
    expect(res.status).toBe(400);
  });
});
