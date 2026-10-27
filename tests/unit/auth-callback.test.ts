import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/auth/callback/route';

const h = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  resolvePublicClinic: vi.fn(),
  provisionPatientIdentity: vi.fn(),
  logEvent: vi.fn(),
  patients: [] as Array<{ id: string; email: string | null }>,
  identityResult: null as { data: { id: string } | null; error: { message: string } | null } | null,
  isSubdomainReady: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      exchangeCodeForSession: h.exchangeCodeForSession,
      getUser: h.getUser,
    },
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: h.from,
  },
}));

vi.mock('@/lib/services/clinics', () => ({ resolvePublicClinic: h.resolvePublicClinic }));
vi.mock('@/lib/services/patientPortal', () => ({ provisionPatientIdentity: h.provisionPatientIdentity }));
vi.mock('@/lib/server/logging', () => ({ logEvent: h.logEvent }));
vi.mock('@/lib/vercel/domains', () => ({
  clinicSpaceUrl: (slug: string) => `https://${slug}.dentairec.com`,
}));
vi.mock('@/lib/vercel/subdomainReadiness', () => ({
  isSubdomainReady: h.isSubdomainReady,
}));

const clinic = { id: '11111111-1111-4111-8111-111111111111', slug: 'amal-x-ray-center' };
const user = {
  id: 'user-1',
  email: 'patient@example.com',
  email_confirmed_at: '2026-10-26T00:00:00.000Z',
};

function createAdminQuery(table: string) {
  const chain: any = {};
  for (const method of ['select', 'eq', 'is', 'not', 'order']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.range = vi.fn(async () => ({ data: h.patients, error: null }));
  chain.maybeSingle = vi.fn(async () => h.identityResult ?? { data: null, error: null });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VERCEL_ENV', 'production');
  h.exchangeCodeForSession.mockResolvedValue({ error: null });
  h.getUser.mockResolvedValue({ data: { user }, error: null });
  h.resolvePublicClinic.mockResolvedValue(clinic);
  h.provisionPatientIdentity.mockResolvedValue({ id: 'identity-1' });
  h.patients = [{ id: 'patient-1', email: ' Patient@Example.com ' }];
  h.identityResult = { data: { id: 'identity-1' }, error: null };
  h.isSubdomainReady.mockResolvedValue(true);
  h.from.mockImplementation((table: string) => createAdminQuery(table));
});

describe('GET /auth/callback', () => {
  it('links one exact email match and returns to the clinic tenant origin', async () => {
    const response = await GET(new Request(
      `https://www.dentairec.com/auth/callback?code=oauth-code&clinic_id=${clinic.id}`,
    ));

    expect(h.provisionPatientIdentity).toHaveBeenCalledWith({
      clinicId: clinic.id,
      patientId: 'patient-1',
      email: 'patient@example.com',
      userId: user.id,
    });
    expect(response.headers.get('location')).toBe('https://amal-x-ray-center.dentairec.com/portal?link=linked');
  });

  it('does not link when more than one patient has the same email', async () => {
    h.patients = [
      { id: 'patient-1', email: 'patient@example.com' },
      { id: 'patient-2', email: 'PATIENT@example.com' },
    ];

    const response = await GET(new Request(
      `https://www.dentairec.com/auth/callback?code=oauth-code&clinic_id=${clinic.id}`,
    ));

    expect(h.provisionPatientIdentity).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://amal-x-ray-center.dentairec.com/portal?link=unlinked');
  });

  it('keeps the callback origin if the clinic subdomain is not registered', async () => {
    h.isSubdomainReady.mockResolvedValue(false);

    const response = await GET(new Request(
      `https://www.dentairec.com/auth/callback?code=oauth-code&clinic_id=${clinic.id}`,
    ));

    expect(response.headers.get('location')).toBe('https://www.dentairec.com/portal?link=linked');
  });
});
