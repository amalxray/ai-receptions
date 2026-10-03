import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * B1 regression guard — /ask must never lose a turn to a provider hiccup.
 *
 *  - providers are registered BEFORE the registry is read (otherwise /ask runs
 *    with an empty registry and silently answers from rules forever);
 *  - generation goes through generateWithFailover() (retry + failover), not a
 *    bare provider.generate();
 *  - when every candidate fails, the failure is LOGGED and the rule-based reply
 *    still answers (never an empty/500 response).
 */

const mockState = vi.hoisted(() => ({
  calls: [] as string[],
  provider: null as unknown,
  lastParams: null as any,
  failoverResult: null as unknown,
  failoverError: null as unknown,
  logCalls: [] as Array<{ event: string; context: any; level?: string }>,
}));

vi.mock('@/lib/ai/providers/registry', () => ({
  ensureAIProviders: () => {
    mockState.calls.push('ensureAIProviders');
  },
}));

vi.mock('@/lib/ai/provider', () => ({
  getProvider: () => {
    mockState.calls.push('getProvider');
    return mockState.provider;
  },
}));

vi.mock('@/lib/ai/resilience', () => ({
  generateWithFailover: async (params: any) => {
    mockState.calls.push('generateWithFailover');
    mockState.lastParams = params;
    if (mockState.failoverError) throw mockState.failoverError;
    return mockState.failoverResult;
  },
}));

vi.mock('@/lib/server/logging', () => ({
  logEvent: (event: string, context: any, level?: string) => {
    mockState.logCalls.push({ event, context, level });
  },
}));

vi.mock('@/lib/services/askContent', () => ({
  runNearbyClinics: vi.fn(async () => []),
  getAskSettings: vi.fn(async () => ({})),
}));

import { answerAsk } from '@/lib/services/askAssistant';

// No location keywords (وين/أقرب/موقعك…) so the flow reaches the AI branch.
const MESSAGE = 'أهلا، بدي أستفيد من خدمات المنصة';

describe('B1 — /ask provider registration + failover', () => {
  beforeEach(() => {
    mockState.calls = [];
    mockState.logCalls = [];
    mockState.provider = { id: 'gemini' };
    mockState.failoverResult = { text: '  نص من المزوّد  ', providerId: 'gemini' };
    mockState.failoverError = null;
  });

  it('registers providers before reading the registry and keeps the flow gated before clinic suggestions', async () => {
    const result = await answerAsk({ message: MESSAGE, location: null });

    expect(mockState.calls[0]).toBe('ensureAIProviders');
    expect(mockState.calls).toContain('generateWithFailover');
    expect(result.reply).toContain('نوع الخدمة');
    expect(result.suggested_clinics).toEqual([]);
    expect(result.needs_location).toBe(false);
    expect(mockState.lastParams.prompt).toContain(MESSAGE);
    expect(mockState.lastParams.maxTokens).toBe(220);
  });

  it('keeps the requested imaging service in the prompt across follow-up turns', async () => {
    const result = await answerAsk({
      message: 'كم سعرها؟',
      location: null,
      history: [
        { role: 'user', content: 'بدي تصوير أشعة بانوراما' },
        { role: 'assistant', content: 'أكيد، هل تبحث عن أقرب مركز؟' },
      ],
    });

    expect(result.reply).toContain('استخدام موقعك الحالي');
    expect(mockState.lastParams.prompt).toContain('تصوير أشعة بانوراما');
    expect(mockState.lastParams.prompt).toContain('لا تقفز إلى ترميم الأسنان أو جراحة اللثة');
  });

  it('asks for the service type before recommending clinics when no location is set', async () => {
    const result = await answerAsk({ message: 'أحتاج مساعدة', location: null });

    expect(result.suggested_clinics).toEqual([]);
    expect(result.reply).toContain('نوع الخدمة');
    expect(result.needs_location).toBe(false);
  });

  it('asks for the user location before suggesting clinics after the service is identified', async () => {
    const result = await answerAsk({ message: 'تصوير اشعة اسنان', location: null });

    expect(result.suggested_clinics).toEqual([]);
    expect(result.reply).toContain('استخدام موقعك الحالي');
    expect(result.needs_location).toBe(true);
  });

  it('falls back to the rule-based reply when no provider is registered', async () => {
    mockState.provider = null;

    const result = await answerAsk({ message: MESSAGE, location: null });

    expect(mockState.calls).not.toContain('generateWithFailover');
    expect(result.reply.length).toBeGreaterThan(0);
    expect(result.needs_location).toBe(false);
  });

  it('logs the failure and still answers when every provider candidate fails', async () => {
    mockState.failoverError = new Error('429 rate limit exceeded');

    const result = await answerAsk({ message: MESSAGE, location: null });

    const logged = mockState.logCalls.find((c) => c.event === 'ask_ai_reply_failed');
    expect(logged).toBeTruthy();
    expect(logged?.level).toBe('warn');
    expect(logged?.context.error).toContain('429');
    // The turn survives: rule-based reply, never an empty response.
    expect(result.reply.length).toBeGreaterThan(0);
    expect(result.reply).not.toContain('نص من المزوّد');
  });
});