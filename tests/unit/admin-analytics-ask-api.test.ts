import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  from: vi.fn(),
  withEntitlement: vi.fn(async (_clinicId: string, _resource: string, run: () => Promise<string>) => run()),
  entitlementErrorResponse: vi.fn(() => null),
  ensureAIProviders: vi.fn(),
  generateWithFailover: vi.fn(),
  logEvent: vi.fn(),
  ownerRows: [{ clinic_id: 'owner-clinic' }] as Array<{ clinic_id: string }>,
  statsError: false,
}));

function queryResult(table: string, kind: string): { count?: number; data?: unknown[]; error: Error | null } {
  if (mocks.statsError && table !== 'clinic_users') return { error: new Error('query failed') };
  if (table === 'clinic_users' && kind === 'owner') return { data: mocks.ownerRows, error: null };
  if (kind === 'count') {
    const countByTable: Record<string, number> = {
      clinics: 12,
      clinic_users: 35,
      subscriptions: 8,
    };
    return { count: countByTable[table] ?? 0, error: null };
  }
  if (table === 'subscriptions') {
    return { data: [{ status: 'active' }, { status: 'active' }, { status: 'trialing' }], error: null };
  }
  if (table === 'clinic_payments') {
    return { data: [{ amount: 25 }, { amount: '75.5' }], error: null };
  }
  return { data: [], error: null };
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));
vi.mock('@/lib/services/platformAdmin', () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));
vi.mock('@/lib/subscription/entitlements', () => ({
  withEntitlement: mocks.withEntitlement,
  entitlementErrorResponse: mocks.entitlementErrorResponse,
}));
vi.mock('@/lib/ai/providers/registry', () => ({ ensureAIProviders: mocks.ensureAIProviders }));
vi.mock('@/lib/ai/resilience', () => ({ generateWithFailover: mocks.generateWithFailover }));
vi.mock('@/lib/server/logging', () => ({ logEvent: mocks.logEvent }));

import { POST } from '@/app/api/admin/analytics/ask/route';

function request(body: unknown): Request {
  return new Request('http://localhost/api/admin/analytics/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/analytics/ask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ownerRows = [{ clinic_id: 'owner-clinic' }];
    mocks.statsError = false;
    mocks.requirePlatformAdmin.mockResolvedValue({
      ok: true,
      admin: { id: 'admin-row', user_id: 'admin-user', email: 'admin@example.test', role: 'owner' },
    });
    mocks.generateWithFailover.mockResolvedValue({ text: 'الإجابة الحالية', providerId: 'test' });
    mocks.from.mockImplementation((table: string) => {
      const query: Record<string, unknown> = {
        table,
        kind: '',
        select(selection: string, options?: { count?: string }) {
          query.kind = options?.count === 'exact' ? 'count' : selection === 'clinic_id' ? 'owner' : 'rows';
          return query;
        },
        eq() { return query; },
        is() { return query; },
        limit() { return query; },
        then(resolve: (result: unknown) => void) {
          return Promise.resolve(queryResult(table, String(query.kind))).then(resolve);
        },
      };
      return query;
    });
    mocks.withEntitlement.mockImplementation(async (_clinicId, _resource, run) => run());
    mocks.entitlementErrorResponse.mockReturnValue(null);
  });

  it('authorizes before reading the body, resolving billing, or charging entitlement', async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({ ok: false, status: 401 });

    const response = await POST(request({ question: 'كم عدد العيادات؟' }));

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.withEntitlement).not.toHaveBeenCalled();
  });

  it('rejects a missing or overlong question without invoking the AI', async () => {
    const missing = await POST(request({ question: ' ' }));
    const tooLong = await POST(request({ question: 'x'.repeat(1001) }));

    expect(missing.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(mocks.withEntitlement).not.toHaveBeenCalled();
    expect(mocks.generateWithFailover).not.toHaveBeenCalled();
  });

  it('requires exactly one active owner clinic and never chooses an arbitrary tenant', async () => {
    mocks.ownerRows = [];
    const response = await POST(request({ question: 'كم عدد العيادات؟' }));

    expect(response.status).toBe(409);
    expect(mocks.withEntitlement).not.toHaveBeenCalled();
    expect(mocks.generateWithFailover).not.toHaveBeenCalled();

    mocks.ownerRows = [{ clinic_id: 'owner-clinic-a' }, { clinic_id: 'owner-clinic-b' }];
    const ambiguousResponse = await POST(request({ question: 'كم عدد العيادات؟' }));

    expect(ambiguousResponse.status).toBe(409);
    expect(mocks.withEntitlement).not.toHaveBeenCalled();
    expect(mocks.generateWithFailover).not.toHaveBeenCalled();
  });

  it('charges agent_runs to the unique owner clinic and supplies only current aggregate stats', async () => {
    const response = await POST(request({ question: 'كم عدد العيادات؟' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { answer: 'الإجابة الحالية' } });
    expect(mocks.withEntitlement).toHaveBeenCalledWith('owner-clinic', 'agent_runs', expect.any(Function));
    expect(mocks.ensureAIProviders).toHaveBeenCalledOnce();
    const prompt = vi.mocked(mocks.generateWithFailover).mock.calls[0][0].prompt;
    expect(prompt).toContain('"clinics":12');
    expect(prompt).toContain('"members":35');
    expect(prompt).toContain('"active_subscriptions":8');
    expect(prompt).toContain('"payments_volume":100.5');
    expect(prompt).toContain('"payments_currency":"ILS (₪)"');
    expect(prompt).toContain('اتجاهات شهرية');
    expect(prompt).toContain('"question":"كم عدد العيادات؟"');
    expect(prompt).not.toContain('owner-clinic');
  });

  it('returns the standard entitlement limit response without loading stats', async () => {
    const limitResponse = new Response(JSON.stringify({ error: 'ENTITLEMENT_LIMIT_REACHED' }), { status: 402 });
    mocks.withEntitlement.mockRejectedValueOnce(new Error('limit reached'));
    mocks.entitlementErrorResponse.mockReturnValueOnce(limitResponse);

    const response = await POST(request({ question: 'كم عدد العيادات؟' }));

    expect(response.status).toBe(402);
    expect(mocks.generateWithFailover).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('returns a safe failure when all AI providers fail', async () => {
    mocks.generateWithFailover.mockRejectedValueOnce(new Error('provider failed'));

    const response = await POST(request({ question: 'ما حالة الاشتراكات؟' }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'ANALYTICS_GENERATION_FAILED' });
    expect(mocks.logEvent).toHaveBeenCalledWith('admin_analytics_agent_failed', {}, 'error');
  });
});
