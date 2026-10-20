import { getProvider, listProviders, type GenerateParams, type GenerateResult } from './provider';
import { logEvent } from '@/lib/server/logging';

/**
 * AI PROVIDER RESILIENCE (Phase 12)
 *
 * Problem: a single `provider.generate()` call meant ANY transient failure
 * (429 rate limit, timeout, network blip) immediately degraded the patient
 * experience to the human-handoff fallback — a provider hiccup became a
 * lost conversation turn.
 *
 * Fix (no same-provider retries, no new credentials, fits the existing registry):
 *  1. Any failed provider call moves to the next configured provider immediately.
 *  2. The human-handoff fallback remains the LAST resort — unchanged.
 *
 * Deliberate policy: local Ollama is EXCLUDED from automatic failover. It is
 * documented as unsuitable for production conversational Arabic; silently
 * failing over to it would degrade reply quality without anyone noticing.
 * It remains fully usable when explicitly selected via AI_PROVIDER=ollama.
 */

/** Matches transient provider/HTTP failures for structured diagnostics. */
const TRANSIENT_ERROR = /timed?\s*out|timeout|rate limit|429|too many requests|internal error|500|bad gateway|502|unavailable|503|504|overloaded|aborted|abort|network|econn|socket|fetch failed|temporarily/i;
const IMMEDIATE_FAILOVER_ERROR = /\b429\b|rate.?limit|too many requests|insufficient[_ ]quota|credit[_ ]balance|quota exceeded/i;

const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 10 * 60 * 1000;
const HALF_OPEN_PROBE_MS = 60 * 1000;

interface BreakerState {
  failures: number[];
  openedAt: number | null;
  probing: boolean;
  lastProbeAt: number | null;
}

const breakers = new Map<string, BreakerState>();

/** Clear process-local breaker state between unit tests. */
export function resetCircuitBreakersForTests(): void {
  breakers.clear();
}

function breakerFor(provider: string): BreakerState {
  let breaker = breakers.get(provider);
  if (!breaker) {
    breaker = { failures: [], openedAt: null, probing: false, lastProbeAt: null };
    breakers.set(provider, breaker);
  }
  return breaker;
}

/** Return true for an open circuit; after its cooldown allow one probe per minute. */
function shouldSkip(provider: string): boolean {
  const breaker = breakers.get(provider);
  if (!breaker || breaker.openedAt === null) return false;

  const now = Date.now();
  if (now - breaker.openedAt < CIRCUIT_OPEN_MS) return true;

  if (
    breaker.probing &&
    breaker.lastProbeAt !== null &&
    now - breaker.lastProbeAt < HALF_OPEN_PROBE_MS
  ) {
    return true;
  }

  breaker.probing = true;
  breaker.lastProbeAt = now;
  logEvent('circuit_breaker_probe_allowed', { provider });
  return false;
}

function recordFailure(provider: string, error: unknown): void {
  const now = Date.now();
  const breaker = breakerFor(provider);
  const wasHalfOpenProbe =
    breaker.openedAt !== null &&
    now - breaker.openedAt >= CIRCUIT_OPEN_MS &&
    breaker.probing;

  breaker.failures = breaker.failures.filter((timestamp) => now - timestamp < FAILURE_WINDOW_MS);
  breaker.failures.push(now);

  logEvent('circuit_breaker_failure', {
    provider,
    failures_in_window: breaker.failures.length,
    error: error instanceof Error ? error.message : String(error),
  }, 'warn');

  if (wasHalfOpenProbe || breaker.failures.length >= FAILURE_THRESHOLD) {
    breaker.openedAt = now;
    breaker.probing = false;
    breaker.lastProbeAt = null;
    logEvent('circuit_breaker_open', {
      provider,
      failures_in_window: breaker.failures.length,
      half_open_probe_failed: wasHalfOpenProbe,
      open_ms: CIRCUIT_OPEN_MS,
    }, 'warn');
  }
}

function recordSuccess(provider: string): void {
  const breaker = breakers.get(provider);
  const wasOpen = Boolean(breaker && breaker.openedAt !== null);
  if (breaker) {
    breaker.failures = [];
    breaker.openedAt = null;
    breaker.probing = false;
    breaker.lastProbeAt = null;
  }
  logEvent('circuit_breaker_success', { provider, circuit_closed: wasOpen });
}

export function isTransientAiError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return TRANSIENT_ERROR.test(message);
}

/** Quota/rate-limit responses are not recoverable by retrying the same provider. */
export function shouldFailoverImmediately(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return IMMEDIATE_FAILOVER_ERROR.test(message);
}

/**
 * Providers eligible for automatic failover, ordered: preferred id → the
 * AI_PROVIDER-configured default → other registered cloud providers.
 * Ollama is only included when it IS the explicitly configured provider.
 */
export function failoverCandidates(preferredProviderId?: string | null): Array<{ id: string; provider: NonNullable<ReturnType<typeof getProvider>> }> {
  const all = listProviders();
  const configured = process.env.AI_PROVIDER ?? 'openai';

  const ordered: Array<{ id: string; provider: NonNullable<ReturnType<typeof getProvider>> }> = [];
  const pushUnique = (id: string): void => {
    if (ordered.some((c) => c.id === id)) return;
    const provider = all.find((p) => p.id === id);
    if (provider) ordered.push({ id, provider });
  };

  if (preferredProviderId) pushUnique(preferredProviderId);
  pushUnique(configured);
  for (const p of all) {
    // Automatic failover never lands on local Ollama unless it is the
    // explicitly configured provider (already pushed above).
    if (p.id === 'ollama' && configured !== 'ollama' && preferredProviderId !== 'ollama') continue;
    pushUnique(p.id);
  }
  return ordered;
}

export type FailoverGenerateResult = GenerateResult & { providerId: string };

/**
 * generate() with immediate secondary-provider failover on any failed call.
 * Throws the LAST error when every candidate fails (callers keep their
 * existing graceful-degradation path).
 */
export type OpenStreamResult = {
  stream: ReadableStream<Uint8Array>;
  providerId: string;
};

/**
 * Resilient OPEN of a provider stream (STEP 8 reliability).
 *
 * Only the stream handshake (the `provider.stream()` call that materializes a
 * ReadableStream) can fail over — once bytes start flowing we cannot switch
 * providers mid-stream. Any handshake failure moves to the next registered
 * provider without a same-provider retry or backoff.
 * Throws the LAST error when every streaming candidate fails so callers keep
 * their existing graceful-degradation path.
 */
export async function openStreamWithFailover(params: GenerateParams & { preferredProviderId?: string | null }): Promise<OpenStreamResult> {
  const { preferredProviderId, ...generateParams } = params;
  const candidates = failoverCandidates(preferredProviderId).filter((c) => typeof c.provider.stream === 'function');
  let lastError: unknown = new Error('No streaming AI provider is registered');
  let attempted = 0;

  for (const candidate of candidates) {
    if (shouldSkip(candidate.id)) {
      logEvent('circuit_breaker_skip', { provider: candidate.id });
      continue;
    }
    const streamFn = candidate.provider.stream!;
    attempted++;
    try {
      const stream = await streamFn(generateParams);
      recordSuccess(candidate.id);
      if (candidates[0].id !== candidate.id) {
        logEvent('ai_stream_failover_succeeded', { provider: candidate.id, attempt: 0 });
      }
      return { stream, providerId: candidate.id };
    } catch (err) {
      lastError = err;
      recordFailure(candidate.id, err);
      logEvent('ai_stream_open_attempt_failed', {
        provider: candidate.id,
        attempt: 0,
        transient: isTransientAiError(err),
        quota_or_rate_limit: shouldFailoverImmediately(err),
        error: err instanceof Error ? err.message : String(err),
      }, 'warn');
    }
  }

  if (attempted === 0 && candidates.length > 0) {
    throw new Error('All streaming AI providers are currently circuit-open');
  }
  throw lastError;
}

export async function generateWithFailover(params: GenerateParams & { preferredProviderId?: string | null }): Promise<FailoverGenerateResult> {
  const { preferredProviderId, ...generateParams } = params;
  const candidates = failoverCandidates(preferredProviderId);
  let lastError: unknown = new Error('No AI provider is registered');
  let attempted = 0;

  for (const candidate of candidates) {
    if (shouldSkip(candidate.id)) {
      logEvent('circuit_breaker_skip', { provider: candidate.id });
      continue;
    }
    attempted++;
    try {
      const result = await candidate.provider.generate(generateParams);
      recordSuccess(candidate.id);
      if (candidates[0].id !== candidate.id) {
        logEvent('ai_failover_succeeded', { provider: candidate.id, attempt: 0 });
      }
      return { ...result, providerId: candidate.id };
    } catch (err) {
      lastError = err;
      recordFailure(candidate.id, err);
      logEvent('ai_generate_attempt_failed', {
        provider: candidate.id,
        attempt: 0,
        transient: isTransientAiError(err),
        quota_or_rate_limit: shouldFailoverImmediately(err),
        error: err instanceof Error ? err.message : String(err),
      }, 'warn');
    }
  }

  if (attempted === 0 && candidates.length > 0) {
    throw new Error('All AI providers are currently circuit-open');
  }
  throw lastError;
}
