import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));

import {
  isTransientAiError,
  failoverCandidates,
  generateWithFailover,
  openStreamWithFailover,
  resetCircuitBreakersForTests,
} from '@/lib/ai/resilience';
import { registerProvider, clearProviders } from '@/lib/ai/provider';

const originalEnv = process.env.AI_PROVIDER;

beforeEach(() => {
  clearProviders();
  resetCircuitBreakersForTests();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  if (originalEnv === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = originalEnv;
});

describe('isTransientAiError — provider failure classification', () => {
  it('classifies rate limits, timeouts and server errors as transient', () => {
    expect(isTransientAiError(new Error('Rate limited (429) during generate'))).toBe(true);
    expect(isTransientAiError(new Error('Anthropic request timed out'))).toBe(true);
    expect(isTransientAiError(new Error('Anthropic internal error (500)'))).toBe(true);
    expect(isTransientAiError(new Error('fetch failed'))).toBe(true);
  });

  it('classifies auth/permission/malformed as NON-transient', () => {
    expect(isTransientAiError(new Error('Authentication failed (401)'))).toBe(false);
    expect(isTransientAiError(new Error('Permission denied (403)'))).toBe(false);
    expect(isTransientAiError(new Error('Anthropic returned an empty or malformed response'))).toBe(false);
  });
});

describe('failoverCandidates — ordering & Ollama policy', () => {
  it('prefers explicit → configured → other cloud providers', () => {
    process.env.AI_PROVIDER = 'anthropic';
    registerProvider({ id: 'openai', generate: async () => ({ text: '' }) });
    registerProvider({ id: 'ollama', generate: async () => ({ text: '' }) });
    registerProvider({ id: 'anthropic', generate: async () => ({ text: '' }) });

    const ids = failoverCandidates(null).map((c) => c.id);
    expect(ids[0]).toBe('anthropic');
    expect(ids).toContain('openai');
    // Ollama excluded from AUTOMATIC failover unless explicitly configured
    expect(ids).not.toContain('ollama');
  });

  it('includes ollama only when explicitly configured', () => {
    process.env.AI_PROVIDER = 'ollama';
    registerProvider({ id: 'ollama', generate: async () => ({ text: '' }) });
    registerProvider({ id: 'openai', generate: async () => ({ text: '' }) });
    const ids = failoverCandidates(null).map((c) => c.id);
    expect(ids[0]).toBe('ollama');
  });
});

describe('openStreamWithFailover — resilient stream OPEN (STEP 8)', () => {
  it('opens a stream from the primary provider on first attempt', async () => {
    process.env.AI_PROVIDER = 'openai';
    const stream = new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode('hi')); c.close(); },
    });
    registerProvider({ id: 'openai', generate: async () => ({ text: '' }), stream: async () => stream });
    const res = await openStreamWithFailover({ prompt: 'p' });
    expect(res.providerId).toBe('openai');
    expect(res.stream).toBe(stream);
  });

  it('fails over immediately on a stream rate limit instead of retrying that provider', async () => {
    process.env.AI_PROVIDER = 'primary';
    const stream = new ReadableStream({ start(c) { c.close(); } });
    let calls = 0;
    registerProvider({
      id: 'primary',
      generate: async () => ({ text: '' }),
      stream: async () => { calls++; throw new Error('Rate limited (429)'); },
    });
    registerProvider({ id: 'openai', generate: async () => ({ text: '' }), stream: async () => stream });
    const res = await openStreamWithFailover({ prompt: 'p' });
    expect(res.providerId).toBe('openai');
    expect(calls).toBe(1);
  });

  it('fails over to a secondary provider when the primary stream keeps failing', async () => {
    process.env.AI_PROVIDER = 'primary';
    let primaryCalls = 0;
    registerProvider({
      id: 'primary',
      generate: async () => ({ text: '' }),
      stream: async () => { primaryCalls++; throw new Error('Anthropic request timed out'); },
    });
    const stream = new ReadableStream({ start(c) { c.close(); } });
    registerProvider({ id: 'openai', generate: async () => ({ text: '' }), stream: async () => stream });
    const res = await openStreamWithFailover({ prompt: 'p' });
    expect(res.providerId).toBe('openai');
    expect(primaryCalls).toBe(1);
  });

  it('throws when every provider stream fails (graceful degradation keeps working)', async () => {
    process.env.AI_PROVIDER = 'a';
    registerProvider({ id: 'a', generate: async () => ({ text: '' }), stream: async () => { throw new Error('Rate limited (429)'); } });
    registerProvider({ id: 'b', generate: async () => ({ text: '' }), stream: async () => { throw new Error('internal error (500)'); } });
    await expect(openStreamWithFailover({ prompt: 'p' })).rejects.toThrow('internal error (500)');
  });

  it('skips candidates that do not implement stream()', async () => {
    process.env.AI_PROVIDER = 'text-only';
    registerProvider({ id: 'text-only', generate: async () => ({ text: '' }) }); // no stream
    const stream = new ReadableStream({ start(c) { c.close(); } });
    registerProvider({ id: 'openai', generate: async () => ({ text: '' }), stream: async () => stream });
    const res = await openStreamWithFailover({ prompt: 'p' });
    expect(res.providerId).toBe('openai');
  });
});

describe('generateWithFailover — resilience paths', () => {
  it('fails over immediately after a transient failure without retrying that provider', async () => {
    process.env.AI_PROVIDER = 'primary';
    let calls = 0;
    registerProvider({
      id: 'primary',
      generate: async () => {
        calls++;
        throw new Error('internal error (500)');
      },
    });
    registerProvider({ id: 'openai', generate: async () => ({ text: 'secondary-ok', totalTokens: 1 }) });

    const result = await generateWithFailover({ prompt: 'p' });
    expect(result.text).toBe('secondary-ok');
    expect(result.providerId).toBe('openai');
    expect(calls).toBe(1);
  });

  it('fails over to the secondary provider when primary keeps failing', async () => {
    process.env.AI_PROVIDER = 'primary';
    let primaryCalls = 0;
    registerProvider({
      id: 'primary',
      generate: async () => {
        primaryCalls++;
        throw new Error('Anthropic request timed out');
      },
    });
    registerProvider({ id: 'openai', generate: async () => ({ text: 'from-secondary' }) });

    const result = await generateWithFailover({ prompt: 'p' });
    expect(result.text).toBe('from-secondary');
    expect(result.providerId).toBe('openai');
    expect(primaryCalls).toBe(1);
  });

  it('does NOT waste retries on non-transient errors — fails over immediately', async () => {
    process.env.AI_PROVIDER = 'broken-auth';
    let calls = 0;
    registerProvider({
      id: 'broken-auth',
      generate: async () => {
        calls++;
        throw new Error('Authentication failed (401)');
      },
    });
    registerProvider({ id: 'openai', generate: async () => ({ text: 'secondary-ok' }) });

    const result = await generateWithFailover({ prompt: 'p' });
    expect(result.providerId).toBe('openai');
    expect(calls).toBe(1);
  });

  it('does NOT retry a rate-limited provider before moving to the next provider', async () => {
    process.env.AI_PROVIDER = 'rate-limited';
    let primaryCalls = 0;
    registerProvider({
      id: 'rate-limited',
      generate: async () => {
        primaryCalls++;
        throw new Error('Rate limited (429): insufficient_quota');
      },
    });
    registerProvider({ id: 'openai', generate: async () => ({ text: 'secondary-ok' }) });

    const result = await generateWithFailover({ prompt: 'p' });
    expect(result.providerId).toBe('openai');
    expect(result.text).toBe('secondary-ok');
    expect(primaryCalls).toBe(1);
  });

  it('throws the last error when every provider fails (handoff stays the last resort)', async () => {
    process.env.AI_PROVIDER = 'a';
    registerProvider({ id: 'a', generate: async () => { throw new Error('Rate limited (429)'); } });
    registerProvider({ id: 'b', generate: async () => { throw new Error('internal error (500)'); } });

    await expect(generateWithFailover({ prompt: 'p' })).rejects.toThrow('internal error (500)');
  });
});
