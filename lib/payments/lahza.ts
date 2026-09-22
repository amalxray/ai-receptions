import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PaymentProviderError, currencyExponent } from './provider';

/**
 * Lahza payment gateway adapter (Palestine) — subscription billing.
 *
 * Everything below is written against the PUBLIC Lahza documentation
 * (docs.lahza.io + api-docs.lahza.io); nothing here is assumed:
 *
 *   Base URL .................. https://api.lahza.io
 *   Create transaction ........ POST /transaction/initialize
 *                               Headers: Authorization: Bearer SECRET_KEY
 *                                        Content-Type: application/json
 *                               Body:    amount*, email*, currency?, reference?,
 *                                        callback_url?, metadata?(stringified
 *                                        JSON), channels?, mobile?, first_name?,
 *                                        last_name?
 *                               Reply:   { status, message,
 *                                          data: { authorization_url,
 *                                                  access_code, reference } }
 *   Verify transaction ........ GET /transaction/verify/:reference
 *                               Reply:   { status, message,
 *                                          data: { status: 'success'|…,
 *                                                  reference, amount, currency,
 *                                                  customer, paid_at } }
 *   Amount unit ............... LOWEST currency value: "agora" if ILS, "qirsh"
 *                               if JOD, "cents" if USD (×100 of the major amount
 *                               — exponent 2 for all three, which is exactly what
 *                               currencyExponent() returns).
 *   Currencies ................ ILS, JOD, USD (defaults to the dashboard one).
 *   Webhook events ............ charge.success + refund.{pending,processing,
 *                               processed,failed}
 *   Webhook source IPs ........ 161.35.20.140, 209.38.219.189 (test AND live)
 *   Reference charset ......... only "-", ".", "=" and alphanumerics allowed.
 *
 * SECURITY POSTURE (deliberate — deviates from the sketch in the task):
 *   Lahza's public docs do NOT document a signed-webhook scheme (unlike Stripe's
 *   `stripe-signature`). Shipping `verifyLahzaWebhook() { return true }` would let
 *   ANYONE forge a `charge.success` and hand out a free subscription. Instead:
 *     1. A webhook NEVER activates anything by itself — activation requires a
 *        live server-side `GET /transaction/verify/:reference` whose amount and
 *        currency must match the intent we created (docs: "It's very important
 *        that you call the Verify endpoint to confirm the status of the
 *        transactions before delivering value").
 *     2. When Lahza sends a signature header we verify it with HMAC-SHA512,
 *        timing-safe (Paystack-compatible, so it works the day Lahza enables it).
 *        A PRESENT-but-invalid signature is rejected outright.
 *     3. Requests from outside Lahza's published IP ranges are rejected.
 *   (1) is what makes a forged webhook harmless; (2)+(3) are defense in depth.
 */

export const LAHZA_API_BASE = 'https://api.lahza.io';

/** Published Lahza webhook source addresses (same list for test and live). */
export const LAHZA_WEBHOOK_IPS: readonly string[] = ['161.35.20.140', '209.38.219.189'];

/** Header Lahza (Paystack-compatible) uses for webhook signatures. */
export const LAHZA_SIGNATURE_HEADER = 'x-lahza-signature';

export type LahzaMode = 'test' | 'live' | 'unconfigured';

export type LahzaConfig = {
  secretKey: string | null;
  publicKey: string | null;
  webhookSecret: string | null;
  mode: LahzaMode;
};

/**
 * Reads the gateway configuration at call time (never at module load, so tests
 * and the Next.js runtime can mutate env between requests).
 *
 * Mode derives from the key prefix Lahza issues (`sk_test_…` / `sk_live_…`) with
 * an explicit LAHZA_MODE override, mirroring getStripeConfig().
 */
export function getLahzaConfig(): LahzaConfig {
  const secretKey = process.env.LAHZA_SECRET_KEY?.trim() || null;
  const publicKey = process.env.NEXT_PUBLIC_LAHZA_PUBLIC_KEY?.trim() || null;
  const webhookSecret = process.env.LAHZA_WEBHOOK_SECRET?.trim() || null;

  let mode: LahzaMode = 'unconfigured';
  if (secretKey) {
    const declared = (process.env.LAHZA_MODE ?? '').toLowerCase();
    if (declared === 'live') mode = 'live';
    else if (declared === 'test') mode = 'test';
    else mode = secretKey.includes('_live_') ? 'live' : 'test';
  }

  return { secretKey, publicKey, webhookSecret, mode };
}

export function isLahzaConfigured(): boolean {
  return getLahzaConfig().mode !== 'unconfigured';
}

/**
 * A gateway reference every Lahza endpoint accepts: hex only, so it can never
 * break the documented charset rule. Prefixed to be self-identifying in Lahza's
 * dashboard and in logs.
 */
export function generateLahzaReference(prefix = 'sub'): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(12).toString('hex')}`;
}

/** True when `amountMinor` is a positive integer for the given currency. */
export function isValidLahzaAmount(amountMinor: unknown, currency: string): boolean {
  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor)) return false;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return false;
  return currencyExponent(currency) > 0;
}

export type InitializeTransactionParams = {
  /** Minor units — server-derived from the plan catalog, never client input. */
  amountMinor: number;
  /** lowercase ISO-4217; one of ils | jod | usd. */
  currency: string;
  email: string;
  reference: string;
  /** Browser redirect target after the payment attempt. */
  callbackUrl: string;
  /** Routed back verbatim by Lahza (stringified JSON over the wire). */
  metadata?: Record<string, string>;
  firstName?: string;
  lastName?: string;
  channels?: string[];
};

export type InitializeTransactionResult = {
  authorizationUrl: string;
  accessCode: string | null;
  reference: string;
};

async function lahzaRequest(path: string, init?: RequestInit): Promise<any> {
  const config = getLahzaConfig();
  if (!config.secretKey) {
    throw new PaymentProviderError('LAHZA_NOT_CONFIGURED', 503, 'LAHZA_SECRET_KEY is missing');
  }
  const res = await fetch(`${LAHZA_API_BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: init?.body,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.status === false) {
    const message = json?.message ?? `Lahza HTTP ${res.status}`;
    throw new PaymentProviderError('LAHZA_REQUEST_FAILED', res.status === 401 ? 503 : 502, message);
  }
  return json;
}

/**
 * Creates a hosted checkout for one payment attempt.
 * The returned `authorizationUrl` is where the browser must be sent.
 */
export async function initializeLahzaTransaction(
  params: InitializeTransactionParams
): Promise<InitializeTransactionResult> {
  const currency = params.currency.toLowerCase();
  if (!isValidLahzaAmount(params.amountMinor, currency)) {
    throw new PaymentProviderError('LAHZA_INVALID_AMOUNT', 400, `Invalid amount for ${currency}`);
  }
  if (!params.email) {
    throw new PaymentProviderError('LAHZA_EMAIL_REQUIRED', 400, 'Customer email is required');
  }

  const body: Record<string, unknown> = {
    amount: String(params.amountMinor),
    email: params.email,
    currency: currency.toUpperCase(),
    reference: params.reference,
    callback_url: params.callbackUrl,
  };
  // Lahza documents `metadata` as a STRINGIFIED JSON object.
  if (params.metadata) body.metadata = JSON.stringify(params.metadata);
  if (params.firstName) body.first_name = params.firstName;
  if (params.lastName) body.last_name = params.lastName;
  if (params.channels?.length) body.channels = params.channels;

  const json = await lahzaRequest('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const data = json?.data ?? {};
  const authorizationUrl = data.authorization_url ?? data.authorizationUrl ?? null;
  if (!authorizationUrl) {
    throw new PaymentProviderError('LAHZA_NO_AUTHORIZATION_URL', 502, 'Lahza returned no checkout URL');
  }
  return {
    authorizationUrl: String(authorizationUrl),
    accessCode: data.access_code ? String(data.access_code) : null,
    reference: String(data.reference ?? params.reference),
  };
}

export type VerifiedTransaction = {
  /** Gateway transaction status: 'success' | 'failed' | 'abandoned' | … */
  status: string;
  reference: string;
  amountMinor: number;
  currency: string;
  channel: string | null;
  customerCode: string | null;
  customerEmail: string | null;
  paidAt: string | null;
  raw: unknown;
};

/**
 * Authoritative transaction state. This is the ONLY thing allowed to activate a
 * subscription (never the browser redirect, never the webhook body alone).
 */
export async function verifyLahzaTransaction(reference: string): Promise<VerifiedTransaction> {
  if (!reference) {
    throw new PaymentProviderError('LAHZA_REFERENCE_REQUIRED', 400, 'reference is required');
  }
  const json = await lahzaRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
  const data = json?.data ?? {};
  return {
    status: String(data.status ?? 'unknown'),
    reference: String(data.reference ?? reference),
    amountMinor: Number(data.amount ?? 0),
    currency: String(data.currency ?? '').toLowerCase(),
    channel: data.channel ?? null,
    customerCode: data.customer?.customer_code ?? null,
    customerEmail: data.customer?.email ?? null,
    paidAt: data.paid_at ?? data.paidAt ?? null,
    raw: json,
  };
}

/**
 * HMAC-SHA512 (hex) verification of a Lahza webhook signature.
 *
 * Returns:
 *   'valid'   → signature present and correct
 *   'invalid' → signature present but wrong (caller MUST reject)
 *   'absent'  → no signature header (caller falls back to verify+IP checks)
 *
 * The signing secret is LAHZA_WEBHOOK_SECRET when configured, else the secret
 * key (Paystack's documented scheme uses the secret key).
 */
export function verifyLahzaSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret?: string | null
): 'valid' | 'invalid' | 'absent' {
  if (!signatureHeader) return 'absent';
  const key = secret ?? getLahzaConfig().webhookSecret ?? getLahzaConfig().secretKey;
  if (!key) return 'invalid';

  const expected = createHmac('sha512', key).update(rawBody, 'utf8').digest('hex');
  const provided = signatureHeader.trim().toLowerCase().replace(/^sha512=/, '');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  if (a.length === 0 || a.length !== b.length) return 'invalid';
  return timingSafeEqual(a, b) ? 'valid' : 'invalid';
}

/**
 * True when the request comes from a documented Lahza webhook address.
 * Callers pass the first `x-forwarded-for` entry (the real client IP as seen by
 * the Vercel edge).
 */
export function isLahzaSourceIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const first = ip.split(',')[0]?.trim() ?? '';
  // Normalise IPv4-mapped IPv6 (::ffff:161.35.20.140) which edges commonly emit.
  const normalized = first.replace(/^::ffff:/i, '');
  return LAHZA_WEBHOOK_IPS.includes(normalized);
}

/** Extracts the client IP from proxy headers, or null when unavailable. */
export function clientIpFromHeaders(headers: Headers): string | null {
  return (
    headers.get('x-forwarded-for') ??
    headers.get('x-real-ip') ??
    headers.get('cf-connecting-ip')
  );
}
