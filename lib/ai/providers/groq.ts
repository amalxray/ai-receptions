import { AIProvider, GenerateParams, GenerateResult } from '../provider';
import { logEvent } from '@/lib/server/logging';

/**
 * GROQ PROVIDER (primary AI — fast, free tier).
 *
 * Groq serves an OpenAI-compatible `/chat/completions` endpoint, so this mirrors
 * the OpenAI provider's request/response shape. It is intentionally GENERATE-
 * ONLY (no `embed`): Groq's catalog has no embeddings endpoint, so knowledge
 * retrieval keeps using whichever registered provider implements `embed`
 * (Gemini/OpenAI). `contextRetrieval` already lowers the confidence threshold
 * when the active provider lacks `embed`, so a missing embed is safe.
 *
 * Ordering note: registered BEFORE Gemini in `providers/registry.ts`, so it is
 * the primary and Gemini is the failover — exactly the reverse of the old
 * Gemini-first chain that surfaced intermittent 504 "المساعد غير متاح".
 */

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
// 120B is the strongest general Arabic/model in the current Groq catalog with
// clean, concise replies (~0.7s). Overridable via GROQ_MODEL without a deploy.
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const REQUEST_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Groq request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Structured error from a non-OK Groq response. Never leaks the API key;
 * message wording matches `resilience.ts` TRANSIENT_ERROR so a 429/5xx retries
 * and fails over instead of dropping the turn.
 */
async function buildProviderError(response: Response, operation: string): Promise<Error> {
  let bodyText = '';
  try {
    bodyText = await response.text();
  } catch {
    bodyText = '(response body unavailable)';
  }
  const safeBody = bodyText
    .replace(/gsk_[A-Za-z0-9_-]{10,}/g, 'gsk_***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .slice(0, 500);

  let errorType = 'Groq error';
  switch (response.status) {
    case 401: errorType = 'Authentication failed'; break;
    case 403: errorType = 'Permission denied'; break;
    case 404: errorType = 'Resource not found (possible invalid model)'; break;
    case 429: errorType = 'Rate limited'; break;
    case 500: errorType = 'Groq internal error'; break;
    case 502:
    case 503:
    case 504: errorType = 'Groq unavailable'; break;
  }
  return new Error(`${errorType} (${response.status}) during ${operation}: ${safeBody}`);
}

export const GroqProvider: AIProvider = {
  id: 'groq',

  async generate({ prompt, maxTokens = 512, temperature = 0.2 }): Promise<GenerateResult> {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('Groq API key is not configured. Set GROQ_API_KEY in the environment.');

    const res = await fetchWithTimeout(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
      }),
    }, REQUEST_TIMEOUT_MS);

    if (!res.ok) {
      const err = await buildProviderError(res, 'generate');
      logEvent('groq_generate_error', { status: res.status, error: err.message }, 'error');
      throw err;
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      logEvent('groq_generate_parse_error', { error: 'Invalid JSON from provider' }, 'error');
      throw new Error('AI provider returned an empty or malformed response: invalid JSON');
    }

    const data = (json ?? {}) as Record<string, unknown>;
    const choices = data.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error('AI provider returned an empty or malformed response: missing choices array');
    }
    const firstChoice = choices[0] as Record<string, unknown>;
    const message = firstChoice?.message as Record<string, unknown> | undefined;
    const text = typeof message?.content === 'string' ? message.content.trim() : '';
    const finishReason = firstChoice?.finish_reason as string | undefined;
    if (!text && finishReason !== 'content_filter') {
      throw new Error('AI provider returned an empty or malformed response: no content in message');
    }

    const usage = data.usage as Record<string, unknown> | undefined;
    const promptTokens = typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
    const completionTokens = typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : 0;
    const totalTokens = typeof usage?.total_tokens === 'number' ? usage.total_tokens : promptTokens + completionTokens;
    const model = typeof data.model === 'string' ? data.model : undefined;

    return { text, promptTokens, completionTokens, totalTokens, model, raw: json };
  },
};

/** Returns whether the Groq provider is configured (API key present). Never returns the key. */
export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}
