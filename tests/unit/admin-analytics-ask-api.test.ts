import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  from: vi.fn(),
  ensureAIProviders: vi.fn(),
  generateWithFailover: vi.fn(),
  logEvent: vi.fn(),
  ownerLookupAttempted: false,
  statsError: false,
}));

function queryResult(table: string, kind: string): { count?: number; data?: unknown[]; error: Error | null } {
  if (mocks.statsError) return { error: new Error('query failed') };
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
  if (table === 'clinics') {
    return { data: [{ id: 'clinic-a', name: 'عيادة أ', slug: 'clinic-a' }], error: null };
  }
  if (table === 'clinic_payments') {
    return {
      data: [
        {
          clinic_id: 'clinic-a',
          direction: 'payment',
          amount: '120.5',
          created_at: new Date().toISOString(),
          status: 'recorded',
          voided_at: null,
        },
        {
          clinic_id: 'clinic-a',
          direction: 'refund',
          amount: 20,
          created_at: new Date().toISOString(),
          status: 'recorded',
          voided_at: null,
        },
      ],
      error: null,
    };
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
    mocks.ownerLookupAttempted = false;
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
          if (table === 'clinic_users' && selection === 'clinic_id') {
            mocks.ownerLookupAttempted = true;
          }
          query.kind = options?.count === 'exact' ? 'count' : 'rows';
          return query;
        },
        eq() { return query; },
        is() { return query; },
        order() { return query; },
        range() { return query; },
        limit() { return query; },
        then(resolve: (result: unknown) => void) {
          return Promise.resolve(queryResult(table, String(query.kind))).then(resolve);
        },
      };
      return query;
    });
  });

  it('authorizes before reading the body or loading platform stats', async () => {
    mocks.requirePlatformAdmin.mockResolvedValue({ ok: false, status: 401 });

    const response = await POST(request({ question: 'كم عدد العيادات؟' }));

    expect(response.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects a missing or overlong question without invoking the AI', async () => {
    const missing = await POST(request({ question: ' ' }));
    const tooLong = await POST(request({ question: 'x'.repeat(1001) }));

    expect(missing.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(mocks.generateWithFailover).not.toHaveBeenCalled();
  });

  it('allows a platform admin without a clinic membership and supplies net payment analytics', async () => {
    const response = await POST(request({ question: 'كم عدد العيادات؟' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { answer: 'الإجابة الحالية' } });
    expect(mocks.ownerLookupAttempted).toBe(false);
    expect(mocks.ensureAIProviders).toHaveBeenCalledOnce();
    const prompt = vi.mocked(mocks.generateWithFailover).mock.calls[0][0].prompt;
    expect(prompt).toContain('"clinics":12');
    expect(prompt).toContain('"members":35');
    expect(prompt).toContain('"active_subscriptions":8');
    expect(prompt).toContain('"payments_volume":100.5');
    expect(prompt).toContain('"payments_currency":"ILS (₪)"');
    expect(prompt).toContain('"clinic_name":"عيادة أ"');
    expect(prompt).toContain('"amount":100.5');
    expect(prompt).toContain('"monthly_net_payments"');
    expect(prompt).toContain('استردادات');
    expect(prompt).not.toContain('اتجاهات شهرية');
    expect(prompt).toContain('"question":"كم عدد العيادات؟"');
    expect(prompt).not.toContain('owner-clinic');
  });

  it('returns a safe failure when all AI providers fail', async () => {
    mocks.generateWithFailover.mockRejectedValueOnce(new Error('provider failed'));

    const response = await POST(request({ question: 'ما حالة الاشتراكات؟' }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'ANALYTICS_GENERATION_FAILED' });
    expect(mocks.logEvent).toHaveBeenCalledWith('admin_analytics_agent_failed', {}, 'error');
  });
});
