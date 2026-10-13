import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroqProvider, isGroqConfigured } from '@/lib/ai/providers/groq';
import { getProviderHealth, registerProvider, clearProviders } from '@/lib/ai/provider';

const mockLogging = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => mockLogging);

function okResponse(text: string, usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text }, finish_reason: 'stop' }],
      usage,
      model: 'openai/gpt-oss-120b',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('Groq Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = 'gsk-test-key-not-real';
    delete process.env.GROQ_MODEL;
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
    vi.unstubAllGlobals();
  });

  describe('isGroqConfigured', () => {
    it('is true only when GROQ_API_KEY is present', () => {
      expect(isGroqConfigured()).toBe(true);
      delete process.env.GROQ_API_KEY;
      expect(isGroqConfigured()).toBe(false);
    });
  });

  describe('generate()', () => {
    it('succeeds with a valid provider response and maps tokens', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('مرحباً! كيف أساعدك؟')));

      const result = await GroqProvider.generate({ prompt: 'مرحبا' });

      expect(result.text).toBe('مرحباً! كيف أساعدك؟');
      expect(result.promptTokens).toBe(10);
      expect(result.completionTokens).toBe(5);
      expect(result.totalTokens).toBe(15);
      expect(result.model).toBe('openai/gpt-oss-120b');
    });

    it('posts to the OpenAI-compatible chat endpoint with the bearer key', async () => {
      const fetchMock = vi.fn().mockResolvedValue(okResponse('ok'));
      vi.stubGlobal('fetch', fetchMock);

      await GroqProvider.generate({ prompt: 'hi', maxTokens: 64, temperature: 0.5 });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(init.headers.Authorization).toBe('Bearer gsk-test-key-not-real');
      const body = JSON.parse(init.body);
      expect(body.model).toBe('openai/gpt-oss-120b');
      expect(body.max_tokens).toBe(64);
      expect(body.temperature).toBe(0.5);
      expect(body.messages[0]).toEqual({ role: 'user', content: 'hi' });
    });

    it('uses the configured model from GROQ_MODEL env', async () => {
      process.env.GROQ_MODEL = 'allam-2-7b';
      const fetchMock = vi.fn().mockResolvedValue(okResponse('ok'));
      vi.stubGlobal('fetch', fetchMock);

      await GroqProvider.generate({ prompt: 'hi' });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('allam-2-7b');
    });

    it('throws a transient-shaped error on 429 so resilience retries/fails over', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 }),
      ));

      await expect(GroqProvider.generate({ prompt: 'hi' })).rejects.toThrow(/Rate limited \(429\)/);
    });

    it('throws a transient-shaped error on 503 so resilience fails over to Gemini', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('upstream', { status: 503 }),
      ));

      await expect(GroqProvider.generate({ prompt: 'hi' })).rejects.toThrow(/Groq unavailable \(503\)/);
    });

    it('throws a NON-transient error on 401 (bad key) so resilience skips retries', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 }),
      ));

      await expect(GroqProvider.generate({ prompt: 'hi' })).rejects.toThrow(/Authentication failed \(401\)/);
    });

    it('throws when the API key is missing', async () => {
      delete process.env.GROQ_API_KEY;
      await expect(GroqProvider.generate({ prompt: 'hi' })).rejects.toThrow(/Groq API key is not configured/);
    });

    it('rejects a malformed response with no choices', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      ));
      await expect(GroqProvider.generate({ prompt: 'hi' })).rejects.toThrow(/missing choices array/);
    });

    it('never leaks the API key in an error message', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'bad key gsk_SECRETVALUE123456' } }), { status: 401 }),
      ));
      await expect(GroqProvider.generate({ prompt: 'hi' })).rejects.toThrow();
      try {
        await GroqProvider.generate({ prompt: 'hi' });
      } catch (e) {
        expect((e as Error).message).not.toContain('gsk_SECRETVALUE123456');
      }
    });
  });

  describe('getProviderHealth (provider-aware)', () => {
    beforeEach(() => clearProviders());

    it('reports configured=true for groq with a key', () => {
      registerProvider(GroqProvider);
      process.env.AI_PROVIDER = 'groq';
      const health = getProviderHealth();
      expect(health.providerId).toBe('groq');
      expect(health.configured).toBe(true);
      expect(health.hasApiKey).toBe(true);
    });

    it('reports configured=false when GROQ_API_KEY is missing', () => {
      registerProvider(GroqProvider);
      process.env.AI_PROVIDER = 'groq';
      delete process.env.GROQ_API_KEY;
      const health = getProviderHealth();
      expect(health.configured).toBe(false);
      expect(health.hasApiKey).toBe(false);
    });
  });
});
