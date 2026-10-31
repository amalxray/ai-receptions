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
export function failoverCandidates(
  preferredProviderId?: string | null,
  allowedProviderIds?: readonly string[],
): Array<{ id: string; provider: NonNullable<ReturnType<typeof getProvider>> }> {
  const allowed = allowedProviderIds ? new Set(allowedProviderIds) : null;
  const all = listProviders().filter((provider) => !allowed || allowed.has(provider.id));
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
export async function openStreamWithFailover(params: GenerateParams & {
  preferredProviderId?: string | null;
  allowedProviderIds?: readonly string[];
}): Promise<OpenStreamResult> {
  const { preferredProviderId, allowedProviderIds, ...generateParams } = params;
  const candidates = failoverCandidates(preferredProviderId, allowedProviderIds).filter((c) => typeof c.provider.stream === 'function');
  let lastError: unknown = new Error('No streaming AI provider is registered');

  for (const candidate of candidates) {
    const streamFn = candidate.provider.stream!;
    try {
      const stream = await streamFn(generateParams);
      if (candidates[0].id !== candidate.id) {
        logEvent('ai_stream_failover_succeeded', { provider: candidate.id, attempt: 0 });
      }
      return { stream, providerId: candidate.id };
    } catch (err) {
      lastError = err;
      logEvent('ai_stream_open_attempt_failed', {
        provider: candidate.id,
        attempt: 0,
        transient: isTransientAiError(err),
        quota_or_rate_limit: shouldFailoverImmediately(err),
        error: err instanceof Error ? err.message : String(err),
      }, 'warn');
    }
  }

  throw lastError;
}

export async function generateWithFailover(params: GenerateParams & {
  preferredProviderId?: string | null;
  /** Restrict a caller to a deliberate provider chain (e.g. public sales bot). */
  allowedProviderIds?: readonly string[];
}): Promise<FailoverGenerateResult> {
  const { preferredProviderId, allowedProviderIds, ...generateParams } = params;
  const candidates = failoverCandidates(preferredProviderId, allowedProviderIds);
  let lastError: unknown = new Error('No AI provider is registered');

  for (const candidate of candidates) {
    try {
      const result = await candidate.provider.generate(generateParams);
      if (candidates[0].id !== candidate.id) {
        logEvent('ai_failover_succeeded', { provider: candidate.id, attempt: 0 });
      }
      return { ...result, providerId: candidate.id };
    } catch (err) {
      lastError = err;
      logEvent('ai_generate_attempt_failed', {
        provider: candidate.id,
        attempt: 0,
        transient: isTransientAiError(err),
        quota_or_rate_limit: shouldFailoverImmediately(err),
        error: err instanceof Error ? err.message : String(err),
      }, 'warn');
    }
  }

  throw lastError;
}
