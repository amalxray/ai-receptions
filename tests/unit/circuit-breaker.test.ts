import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedLogger = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => mockedLogger);

import { clearProviders, registerProvider } from '@/lib/ai/provider';
import {
  generateWithFailover,
  openStreamWithFailover,
  resetCircuitBreakersForTests,
} from '@/lib/ai/resilience';

const originalProvider = process.env.AI_PROVIDER;
const TEST_START = new Date('2026-01-01T00:00:00.000Z');

function setupProvider(
  id: string,
  generate: () => Promise<{ text: string }> = async () => ({ text: 'ok' }),
  stream?: () => Promise<ReadableStream<Uint8Array>>,
) {
  process.env.AI_PROVIDER = id;
  registerProvider({ id, generate, ...(stream ? { stream } : {}) });
}

async function failGenerate(times: number, id = 'provider') {
  for (let i = 0; i < times; i++) {
    await expect(generateWithFailover({ prompt: 'test' })).rejects.toThrow('provider failed');
  }
}

async function openCircuit(id = 'provider') {
  setupProvider(id, async () => { throw new Error('provider failed'); });
  await failGenerate(3, id);
}

function closedStream() {
  return new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TEST_START);
  clearProviders();
  resetCircuitBreakersForTests();
  mockedLogger.logEvent.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  clearProviders();
  resetCircuitBreakersForTests();
  if (originalProvider === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = originalProvider;
});

describe('provider circuit breaker', () => {
  it('records successful provider calls', async () => {
    setupProvider('provider');
    await expect(generateWithFailover({ prompt: 'test' })).resolves.toMatchObject({ text: 'ok' });
    expect(mockedLogger.logEvent).toHaveBeenCalledWith('circuit_breaker_success', expect.objectContaining({ provider: 'provider' }));
  });

  it('does not open before the third failure', async () => {
    let calls = 0;
    setupProvider('provider', async () => { calls++; throw new Error('provider failed'); });
    await failGenerate(2);
    expect(calls).toBe(2);
    await expect(generateWithFailover({ prompt: 'test' })).rejects.toThrow('provider failed');
    expect(calls).toBe(3);
    expect(mockedLogger.logEvent).toHaveBeenCalledWith('circuit_breaker_open', expect.anything(), 'warn');
  });

  it('skips an open provider after three failures', async () => {
    let calls = 0;
    setupProvider('provider', async () => { calls++; throw new Error('provider failed'); });
    await failGenerate(3);
    await expect(generateWithFailover({ prompt: 'test' })).rejects.toThrow('All AI providers are currently circuit-open');
    expect(calls).toBe(3);
    expect(mockedLogger.logEvent).toHaveBeenCalledWith('circuit_breaker_skip', { provider: 'provider' });
  });

  it('expires failures outside the five-minute rolling window', async () => {
    let calls = 0;
    setupProvider('provider', async () => { calls++; throw new Error('provider failed'); });
    await failGenerate(2);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await expect(generateWithFailover({ prompt: 'test' })).rejects.toThrow('provider failed');
    expect(calls).toBe(3);
    expect(mockedLogger.logEvent).not.toHaveBeenCalledWith('circuit_breaker_open', expect.anything(), 'warn');
  });

  it('does not count failures older than five minutes toward the threshold', async () => {
    let calls = 0;
    setupProvider('provider', async () => { calls++; throw new Error('provider failed'); });
    await expect(generateWithFailover({ prompt: 'test' })).rejects.toThrow('provider failed');
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    await expect(generateWithFailover({ prompt: 'test' })).rejects.toThrow('provider failed');
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await expect(generateWithFailover({ prompt: 'test' })).rejects.toThrow('provider failed');
    expect(calls).toBe(3);
    expect(mockedLogger.logEvent).not.toHaveBeenCalledWith('circuit_breaker_open', expect.anything(), 'warn');
  });

  it('stays open until the ten-minute cooldown completes', async () => {
    let calls = 0;
    await openCircuit();
    const provider = 'provider';
    // Replace the failing implementation to prove that the still-open circuit skips it.
    clearProviders();
    setupProvider(provider, async () => { calls++; return { text: 'recovered' }; });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 - 1);
    await expect(generateWithFailover({ prompt: 'test' })).rejects.toThrow('All AI providers are currently circuit-open');
    expect(calls).toBe(0);
  });

  it('allows a half-open probe when the ten-minute cooldown completes', async () => {
    await openCircuit();
    clearProviders();
    let calls = 0;
    setupProvider('provider', async () => { calls++; return { text: 'probe' }; });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await expect(generateWithFailover({ prompt: 'test' })).resolves.toMatchObject({ text: 'probe' });
    expect(calls).toBe(1);
    expect(mockedLogger.logEvent).toHaveBeenCalledWith('circuit_breaker_probe_allowed', { provider: 'provider' });
  });

  it('closes and clears the circuit after a successful half-open probe', async () => {
    await openCircuit();
    clearProviders();
    setupProvider('provider');
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await generateWithFailover({ prompt: 'probe' });
    mockedLogger.logEvent.mockClear();
    await generateWithFailover({ prompt: 'normal call' });
    expect(mockedLogger.logEvent).toHaveBeenCalledWith('circuit_breaker_success', { provider: 'provider', circuit_closed: false });
  });

  it('reopens for ten minutes when a half-open probe fails', async () => {
    let calls = 0;
    await openCircuit();
    clearProviders();
    setupProvider('provider', async () => { calls++; throw new Error('provider failed'); });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await expect(generateWithFailover({ prompt: 'probe' })).rejects.toThrow('provider failed');
    await expect(generateWithFailover({ prompt: 'still open' })).rejects.toThrow('All AI providers are currently circuit-open');
    expect(calls).toBe(1);
    expect(mockedLogger.logEvent).toHaveBeenCalledWith('circuit_breaker_open', expect.objectContaining({ half_open_probe_failed: true }), 'warn');
  });

  it('allows at most one half-open probe during each one-minute interval', async () => {
    let resolveProbe!: (value: { text: string }) => void;
    let calls = 0;
    await openCircuit();
    clearProviders();
    setupProvider('provider', () => {
      calls++;
      return new Promise((resolve) => { resolveProbe = resolve; });
    });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    const first = generateWithFailover({ prompt: 'first probe' });
    await Promise.resolve();
    await expect(generateWithFailover({ prompt: 'second probe' })).rejects.toThrow('All AI providers are currently circuit-open');
    expect(calls).toBe(1);
    resolveProbe({ text: 'ok' });
    await expect(first).resolves.toMatchObject({ text: 'ok' });
  });

  it('allows another half-open probe after one minute if the first is still pending', async () => {
    const resolvers: Array<(value: { text: string }) => void> = [];
    let calls = 0;
    await openCircuit();
    clearProviders();
    setupProvider('provider', () => {
      calls++;
      return new Promise((resolve) => { resolvers.push(resolve); });
    });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    const first = generateWithFailover({ prompt: 'first probe' });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60 * 1000);
    const second = generateWithFailover({ prompt: 'second probe' });
    await Promise.resolve();
    expect(calls).toBe(2);
    resolvers.forEach((resolve) => resolve({ text: 'ok' }));
    await Promise.all([first, second]);
  });

  it('isolates breaker state by provider id', async () => {
    await openCircuit('provider-a');
    clearProviders();
    let secondaryCalls = 0;
    process.env.AI_PROVIDER = 'provider-b';
    registerProvider({ id: 'provider-b', generate: async () => { secondaryCalls++; return { text: 'ok' }; } });
    await expect(generateWithFailover({ prompt: 'test' })).resolves.toMatchObject({ text: 'ok', providerId: 'provider-b' });
    expect(secondaryCalls).toBe(1);
  });

  it('fails over to a healthy provider when the preferred provider is open', async () => {
    await openCircuit('primary');
    clearProviders();
    process.env.AI_PROVIDER = 'primary';
    let secondaryCalls = 0;
    registerProvider({ id: 'primary', generate: async () => ({ text: 'should not run' }) });
    registerProvider({ id: 'secondary', generate: async () => { secondaryCalls++; return { text: 'secondary' }; } });
    await expect(generateWithFailover({ prompt: 'test' })).resolves.toMatchObject({ text: 'secondary', providerId: 'secondary' });
    expect(secondaryCalls).toBe(1);
  });

  it('opens a circuit for stream handshake failures too', async () => {
    let calls = 0;
    setupProvider('provider', async () => ({ text: 'unused' }), async () => { calls++; throw new Error('provider failed'); });
    for (let i = 0; i < 3; i++) {
      await expect(openStreamWithFailover({ prompt: 'test' })).rejects.toThrow('provider failed');
    }
    await expect(openStreamWithFailover({ prompt: 'test' })).rejects.toThrow('All streaming AI providers are currently circuit-open');
    expect(calls).toBe(3);
  });

  it('closes a stream circuit after a successful half-open probe', async () => {
    let calls = 0;
    setupProvider('provider', async () => ({ text: 'unused' }), async () => { calls++; throw new Error('provider failed'); });
    for (let i = 0; i < 3; i++) await expect(openStreamWithFailover({ prompt: 'test' })).rejects.toThrow('provider failed');
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    clearProviders();
    setupProvider('provider', async () => ({ text: 'unused' }), async () => { calls++; return closedStream(); });
    await expect(openStreamWithFailover({ prompt: 'probe' })).resolves.toMatchObject({ providerId: 'provider' });
    expect(calls).toBe(4);
  });
});
