import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

/**
 * LAHZA PAYMENT GATEWAY — adapter + checkout/webhook/callback contract tests.
 *
 * What is asserted (the parts that decide whether money == entitlement):
 *   * pure adapter behaviour (config/mode, amount validation, reference charset,
 *     HMAC-SHA512 signature verification, published IP allowlist)
 *   * POST /transaction/initialize request shape + response parsing
 *   * GET  /transaction/verify/:reference parsing
 *   * checkout route: auth, free-plan rejection, unconfigured 503, server-derived
 *     amount/currency/reference, intent persisted BEFORE the gateway call
 *   * webhook: signature/IP/dup/unknown-event handling and the "never activate
 *     from the body" rule
 *   * activation: verify success + amount/currency guards + idempotency
 *   * callback: tenant-scoped redirect with an explicit outcome flag
 */

const mockAuth = vi.hoisted(() => ({
  authorizeClinicRequest: vi.fn(),
  roleDenied: vi.fn(() => null),
  ADMIN_ROLES: ['owner', 'manager'],
}));
vi.mock('@/lib/services/clinicAuthorization', () => mockAuth);

const mockLogging = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => mockLogging);

type DbResult = { data?: unknown; error?: unknown };

// Per-table FIFO result queue + a fresh chainable builder per `from()` call, so
// each request's reads/writes are scripted in the order the code performs them.
const mockDb = vi.hoisted(() => {
  type Bucket = { results: DbResult[]; inserts: unknown[]; updates: unknown[]; upserts: unknown[] };
  const tables: Record<string, Bucket> = {};

  function bucket(table: string): Bucket {
    tables[table] = tables[table] ?? { results: [], inserts: [], updates: [], upserts: [] };
    return tables[table];
  }
  function nextResult(table: string): DbResult {
    const b = bucket(table);
    return b.results.length ? b.results.shift()! : { data: null, error: null };
  }
  function makeChain(table: string) {
    const b = bucket(table);
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (payload: unknown) => { b.inserts.push(payload); return chain; },
      update: (payload: unknown) => { b.updates.push(payload); return chain; },
      upsert: (payload: unknown) => { b.upserts.push(payload); return chain; },
      delete: () => chain,
      eq: () => chain,
      neq: () => chain,
      is: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => nextResult(table),
      single: async () => nextResult(table),
      then: (resolve: (value: DbResult) => unknown) => Promise.resolve(nextResult(table)).then(resolve),
    };
    return chain;
  }

  const client = { from: (table: string) => makeChain(table) };

  return {
    client,
    queue(table: string, ...results: DbResult[]) {
      bucket(table).results.push(...results);
    },
    inserted(table: string) {
      return bucket(table).inserts;
    },
    updated(table: string) {
      return bucket(table).updates;
    },
    upserted(table: string) {
      return bucket(table).upserts;
    },
    reset() {
      for (const key of Object.keys(tables)) delete tables[key];
    },
  };
});
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mockDb.client }));

import { POST as lahzaCheckout } from '@/app/api/payments/lahza/checkout/route';
import { POST as lahzaWebhook } from '@/app/api/payments/lahza/webhook/route';
import { GET as lahzaCallback } from '@/app/api/payments/lahza/callback/route';
import {
  getLahzaConfig,
  generateLahzaReference,
  initializeLahzaTransaction,
  isLahzaSourceIp,
  isValidLahzaAmount,
  verifyLahzaSignature,
  verifyLahzaTransaction,
  LAHZA_WEBHOOK_IPS,
} from '@/lib/payments/lahza';
import {
  activateLahzaSubscription,
  lahzaEventKey,
  periodEndFor,
} from '@/lib/payments/lahzaActivation';

const CLINIC_A = '11111111-1111-1111-1111-111111111111';
const REFERENCE = 'sub-testref123';
const WEBHOOK_SECRET = 'whsec_lahza_test_secret';

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function jsonBody(data: unknown, method = 'POST'): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) };
}

function intentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'intent-1',
    provider: 'lahza',
    reference: REFERENCE,
    clinic_id: CLINIC_A,
    plan_id: 'advanced',
    billing_interval: 'month',
    amount_minor: 6900,
    currency: 'usd',
    status: 'pending',
    ...overrides,
  };
}

/** Gateway response builders matching the documented payload shapes. */
function initResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: true,
    message: 'Authorization URL created',
    data: {
      authorization_url: 'https://checkout.lahza.io/keigjNjru82',
      access_code: 'jsj823JUD',
      reference: REFERENCE,
      ...overrides,
    },
  };
}
function verifyResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: true,
    message: 'Verification successful',
    data: {
      id: 690075529,
      status: 'success',
      reference: REFERENCE,
      amount: 6900,
      currency: 'USD',
      channel: 'card',
      paid_at: '2026-09-22T10:00:00.000Z',
      customer: { email: 'owner@clinic.ps', customer_code: 'CUS_abc123' },
      ...overrides,
    },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.reset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  delete process.env.LAHZA_SECRET_KEY;
  delete process.env.LAHZA_MODE;
  delete process.env.LAHZA_WEBHOOK_SECRET;

  mockAuth.authorizeClinicRequest.mockResolvedValue({
    authorized: true,
    user: { id: 'u-owner', email: 'owner@clinic.ps' },
    role: 'owner',
  });
  mockAuth.roleDenied.mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Lahza adapter — configuration & pure helpers', () => {
  it('reports unconfigured without a secret key', () => {
    expect(getLahzaConfig().mode).toBe('unconfigured');
  });

  it('defaults to test mode and switches to live on an sk_live_ key', () => {
    process.env.LAHZA_SECRET_KEY = 'sk_test_abc';
    expect(getLahzaConfig().mode).toBe('test');
    process.env.LAHZA_SECRET_KEY = 'sk_live_abc';
    expect(getLahzaConfig().mode).toBe('live');
  });

  it('honours an explicit LAHZA_MODE override', () => {
    process.env.LAHZA_SECRET_KEY = 'sk_test_abc';
    process.env.LAHZA_MODE = 'live';
    expect(getLahzaConfig().mode).toBe('live');
  });

  it('validates amounts as positive integers in a supported currency', () => {
    expect(isValidLahzaAmount(6900, 'usd')).toBe(true);
    expect(isValidLahzaAmount(6900, 'ils')).toBe(true);
    expect(isValidLahzaAmount(6900, 'jod')).toBe(true);
    expect(isValidLahzaAmount(0, 'usd')).toBe(false);
    expect(isValidLahzaAmount(-100, 'usd')).toBe(false);
    expect(isValidLahzaAmount(69.5, 'usd')).toBe(false);
    expect(isValidLahzaAmount(Number.NaN, 'usd')).toBe(false);
  });

  it('generates references inside Lahza\'s allowed charset and unique per call', () => {
    const a = generateLahzaReference('sub');
    const b = generateLahzaReference('sub');
    expect(a).toMatch(/^[A-Za-z0-9\-.=]+$/);
    expect(a.startsWith('sub-')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('verifies an HMAC-SHA512 webhook signature and rejects a wrong one', () => {
    const raw = JSON.stringify({ event: 'charge.success', data: { reference: REFERENCE } });
    const good = createHmac('sha512', WEBHOOK_SECRET).update(raw, 'utf8').digest('hex');
    expect(verifyLahzaSignature(raw, good, WEBHOOK_SECRET)).toBe('valid');
    expect(verifyLahzaSignature(raw, `sha512=${good}`, WEBHOOK_SECRET)).toBe('valid');
    expect(verifyLahzaSignature(raw, 'deadbeef', WEBHOOK_SECRET)).toBe('invalid');
    expect(verifyLahzaSignature(raw, null, WEBHOOK_SECRET)).toBe('absent');
    expect(verifyLahzaSignature(raw, good, '')).toBe('invalid');
  });

  it('accepts only the published Lahza webhook source IPs', () => {
    for (const ip of LAHZA_WEBHOOK_IPS) expect(isLahzaSourceIp(ip)).toBe(true);
    expect(isLahzaSourceIp('::ffff:161.35.20.140')).toBe(true);
    expect(isLahzaSourceIp('161.35.20.140, 10.0.0.1')).toBe(true);
    expect(isLahzaSourceIp('8.8.8.8')).toBe(false);
    expect(isLahzaSourceIp(null)).toBe(false);
  });
});

describe('Lahza adapter — HTTP calls', () => {
  beforeEach(() => {
    process.env.LAHZA_SECRET_KEY = 'sk_test_abc';
  });

  it('initializes a transaction with documented fields (minor amount, stringified metadata)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => initResponse() });

    const result = await initializeLahzaTransaction({
      amountMinor: 6900,
      currency: 'usd',
      email: 'owner@clinic.ps',
      reference: REFERENCE,
      callbackUrl: 'https://app.test/api/payments/lahza/callback',
      metadata: { clinic_id: CLINIC_A, plan_id: 'advanced' },
    });

    expect(result.authorizationUrl).toBe('https://checkout.lahza.io/keigjNjru82');
    expect(result.accessCode).toBe('jsj823JUD');
    expect(result.reference).toBe(REFERENCE);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.lahza.io/transaction/initialize');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk_test_abc');
    const body = JSON.parse(init.body);
    expect(body.amount).toBe('6900');            // string, minor units
    expect(body.currency).toBe('USD');           // uppercase as documented
    expect(body.email).toBe('owner@clinic.ps');
    expect(body.reference).toBe(REFERENCE);
    expect(body.callback_url).toBe('https://app.test/api/payments/lahza/callback');
    expect(JSON.parse(body.metadata)).toEqual({ clinic_id: CLINIC_A, plan_id: 'advanced' });
  });

  it('refuses an invalid amount before calling the gateway', async () => {
    await expect(
      initializeLahzaTransaction({
        amountMinor: 0,
        currency: 'usd',
        email: 'owner@clinic.ps',
        reference: REFERENCE,
        callbackUrl: 'https://app.test/cb',
      })
    ).rejects.toThrow(/Invalid amount/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a gateway error instead of a fake URL', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ status: false, message: 'Invalid key' }),
    });
    await expect(
      initializeLahzaTransaction({
        amountMinor: 6900,
        currency: 'usd',
        email: 'owner@clinic.ps',
        reference: REFERENCE,
        callbackUrl: 'https://app.test/cb',
      })
    ).rejects.toThrow(/Invalid key/);
  });

  it('rejects a reply without an authorization URL', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: true, data: {} }) });
    await expect(
      initializeLahzaTransaction({
        amountMinor: 6900,
        currency: 'usd',
        email: 'owner@clinic.ps',
        reference: REFERENCE,
        callbackUrl: 'https://app.test/cb',
      })
    ).rejects.toThrow(/no checkout URL/i);
  });

  it('verifies a transaction through GET /transaction/verify/:reference', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => verifyResponse() });

    const verified = await verifyLahzaTransaction(REFERENCE);
    expect(verified.status).toBe('success');
    expect(verified.amountMinor).toBe(6900);
    expect(verified.currency).toBe('usd');
    expect(verified.customerCode).toBe('CUS_abc123');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.lahza.io/transaction/verify/${REFERENCE}`);
    expect(init?.method ?? 'GET').toBe('GET');
  });
});

describe('Payroll-free billing helpers — period end', () => {
  it('adds one month, clamping the day to the target month length', () => {
    const jan31 = new Date('2026-01-31T12:00:00.000Z');
    const end = periodEndFor('month', jan31);
    // 2026 is not a leap year → Feb 28, never Mar 3.
    expect(end.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('adds a full year for yearly plans', () => {
    const end = periodEndFor('year', new Date('2026-09-22T10:00:00.000Z'));
    expect(end.toISOString().slice(0, 10)).toBe('2027-09-22');
  });

  it('builds a deterministic webhook dedup key', () => {
    expect(lahzaEventKey('charge.success', REFERENCE)).toBe(`charge.success:${REFERENCE}`);
    expect(lahzaEventKey('charge.success', null)).toBe('charge.success:none');
  });
});

describe('activateLahzaSubscription — money guards & idempotency', () => {
  beforeEach(() => {
    process.env.LAHZA_SECRET_KEY = 'sk_test_abc';
  });

  it('activates on a verified success and settles the intent', async () => {
    mockDb.queue('payment_checkout_intents', { data: intentRow(), error: null }, { data: null, error: null });
    mockDb.queue('subscriptions', { data: null, error: null }, { data: { id: 'sub-1' }, error: null });
    fetchMock.mockResolvedValue({ ok: true, json: async () => verifyResponse() });

    const outcome = await activateLahzaSubscription(REFERENCE, 'webhook');
    expect(outcome.status).toBe('activated');
    if (outcome.status === 'activated') {
      expect(outcome.clinicId).toBe(CLINIC_A);
      expect(outcome.subscriptionId).toBe('sub-1');
    }

    const subscriptionInsert = mockDb.inserted('subscriptions')[0] as Record<string, unknown>;
    expect(subscriptionInsert).toMatchObject({
      clinic_id: CLINIC_A,
      plan_id: 'advanced',
      status: 'active',
      billing_status: 'monthly',
      cancel_at_period_end: false,
      billing_customer_id: 'CUS_abc123',
    });

    const settlement = mockDb.updated('payment_checkout_intents').at(-1) as Record<string, unknown>;
    expect(settlement.status).toBe('paid');
  });

  it('never activates on an underpaid transaction', async () => {
    mockDb.queue('payment_checkout_intents', { data: intentRow(), error: null }, { data: null, error: null });
    fetchMock.mockResolvedValue({ ok: true, json: async () => verifyResponse({ amount: 100 }) });

    const outcome = await activateLahzaSubscription(REFERENCE, 'webhook');
    expect(outcome.status).toBe('failed');
    expect(mockDb.inserted('subscriptions')).toHaveLength(0);
    const settlement = mockDb.updated('payment_checkout_intents').at(-1) as Record<string, unknown>;
    expect(String(settlement.failure_reason)).toContain('underpaid');
  });

  it('never activates on a currency mismatch', async () => {
    mockDb.queue('payment_checkout_intents', { data: intentRow(), error: null }, { data: null, error: null });
    fetchMock.mockResolvedValue({ ok: true, json: async () => verifyResponse({ currency: 'ILS' }) });

    const outcome = await activateLahzaSubscription(REFERENCE, 'webhook');
    expect(outcome.status).toBe('failed');
    expect(mockDb.inserted('subscriptions')).toHaveLength(0);
  });

  it('never activates when the gateway status is not success', async () => {
    mockDb.queue('payment_checkout_intents', { data: intentRow(), error: null }, { data: null, error: null });
    fetchMock.mockResolvedValue({ ok: true, json: async () => verifyResponse({ status: 'abandoned' }) });

    const outcome = await activateLahzaSubscription(REFERENCE, 'callback');
    expect(outcome.status).toBe('failed');
    expect(mockDb.inserted('subscriptions')).toHaveLength(0);
  });

  it('is idempotent: a settled intent never re-extends the period', async () => {
    mockDb.queue('payment_checkout_intents', { data: intentRow({ status: 'paid' }), error: null });

    const outcome = await activateLahzaSubscription(REFERENCE, 'webhook');
    expect(outcome.status).toBe('already_active');
    expect(fetchMock).not.toHaveBeenCalled();          // no second verify call
    expect(mockDb.inserted('subscriptions')).toHaveLength(0);
  });

  it('reports an unknown reference without touching the gateway', async () => {
    mockDb.queue('payment_checkout_intents', { data: null, error: null });
    const outcome = await activateLahzaSubscription('sub-unknown', 'webhook');
    expect(outcome.status).toBe('unknown_reference');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/payments/lahza/checkout', () => {
  const url = (clinicId: string | null) =>
    `http://localhost/api/payments/lahza/checkout${clinicId ? `?clinic_id=${clinicId}` : ''}`;

  beforeEach(() => {
    process.env.LAHZA_SECRET_KEY = 'sk_test_abc';
  });

  it('requires clinic_id', async () => {
    const res = await lahzaCheckout(makeRequest(url(null), jsonBody({ plan_id: 'advanced' })));
    expect(res.status).toBe(400);
  });

  it('is unreachable without an active membership', async () => {
    mockAuth.authorizeClinicRequest.mockResolvedValue({ authorized: false, status: 403 });
    const res = await lahzaCheckout(makeRequest(url(CLINIC_A), jsonBody({ plan_id: 'advanced' })));
    expect(res.status).toBe(403);
  });

  it('is forbidden for non-admin members', async () => {
    mockAuth.roleDenied.mockReturnValue({ authorized: false, status: 403 });
    const res = await lahzaCheckout(makeRequest(url(CLINIC_A), jsonBody({ plan_id: 'advanced' })));
    expect(res.status).toBe(403);
  });

  it('rejects an unknown plan id', async () => {
    const res = await lahzaCheckout(makeRequest(url(CLINIC_A), jsonBody({ plan_id: 'nope' })));
    expect(res.status).toBe(400);
  });

  it('rejects a plan that does not require payment', async () => {
    const res = await lahzaCheckout(makeRequest(url(CLINIC_A), jsonBody({ plan_id: 'free_trial' })));
    expect(res.status).toBe(400);
  });

  it('answers 503 PAYMENT_NOT_CONFIGURED when no key is configured', async () => {
    delete process.env.LAHZA_SECRET_KEY;
    const res = await lahzaCheckout(makeRequest(url(CLINIC_A), jsonBody({ plan_id: 'advanced' })));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('PAYMENT_NOT_CONFIGURED');
  });

  it('creates the intent server-side then returns the gateway URL', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => initResponse() });

    const res = await lahzaCheckout(makeRequest(url(CLINIC_A), jsonBody({ plan_id: 'advanced' })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://checkout.lahza.io/keigjNjru82');
    expect(body.provider).toBe('lahza');
    expect(body.mode).toBe('test');

    const intent = mockDb.inserted('payment_checkout_intents')[0] as Record<string, unknown>;
    expect(intent).toMatchObject({
      provider: 'lahza',
      clinic_id: CLINIC_A,
      plan_id: 'advanced',
      billing_interval: 'month',
      amount_minor: 6900,        // server-derived from the catalog
      currency: 'usd',
      status: 'pending',
      created_by: 'u-owner',
    });
    // The reference is OUR server-generated one, not something from the client.
    expect(String(intent.reference)).toMatch(/^sub-[a-z0-9]+-[0-9a-f]{24}$/);
  });

  it('reports a missing payment schema instead of a vague 500', async () => {
    mockDb.queue('payment_checkout_intents', {
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.payment_checkout_intents'" },
    });
    const res = await lahzaCheckout(makeRequest(url(CLINIC_A), jsonBody({ plan_id: 'advanced' })));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('PAYMENT_SCHEMA_MISSING');
    expect(String(body.detail)).toContain('PGRST205');
  });
});

describe('POST /api/payments/lahza/webhook', () => {
  const WEBHOOK_URL = 'http://localhost/api/payments/lahza/webhook';
  const LAHZA_IP = LAHZA_WEBHOOK_IPS[0];

  function webhookRequest(payload: unknown, opts: { ip?: string | null; signature?: string } = {}) {
    const raw = JSON.stringify(payload);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.ip !== null) headers['x-forwarded-for'] = opts.ip ?? LAHZA_IP;
    const secret = opts.signature === 'valid' ? WEBHOOK_SECRET : process.env.LAHZA_SECRET_KEY;
    if (opts.signature === 'valid' && secret) {
      headers['x-lahza-signature'] = createHmac('sha512', secret).update(raw, 'utf8').digest('hex');
    } else if (opts.signature === 'invalid') {
      headers['x-lahza-signature'] = 'deadbeef';
    }
    return new Request(WEBHOOK_URL, { method: 'POST', headers, body: raw });
  }

  const event = () => ({ event: 'charge.success', data: { reference: REFERENCE, amount: 6900, currency: 'USD' } });

  beforeEach(() => {
    process.env.LAHZA_SECRET_KEY = 'sk_test_abc';
    process.env.LAHZA_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  it('rejects a present-but-invalid signature with 400', async () => {
    const res = await lahzaWebhook(webhookRequest(event(), { signature: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('rejects a non-Lahza source IP with 403', async () => {
    const res = await lahzaWebhook(webhookRequest(event(), { ip: '8.8.8.8' }));
    expect(res.status).toBe(403);
  });

  it('accepts a valid signature and activates after a successful verify', async () => {
    mockDb.queue('lahza_webhook_events', { data: null, error: null });      // dedup read
    mockDb.queue('payment_checkout_intents', { data: intentRow(), error: null }, { data: null, error: null });
    mockDb.queue('subscriptions', { data: null, error: null }, { data: { id: 'sub-1' }, error: null });
    fetchMock.mockResolvedValue({ ok: true, json: async () => verifyResponse() });

    const res = await lahzaWebhook(webhookRequest(event(), { signature: 'valid' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.status).toBe('activated');
    expect(mockDb.inserted('subscriptions')).toHaveLength(1);
  });

  it('acknowledges a duplicate delivery without re-activating', async () => {
    mockDb.queue('lahza_webhook_events', { data: { id: 'evt-1' }, error: null });

    const res = await lahzaWebhook(webhookRequest(event()));
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockDb.inserted('subscriptions')).toHaveLength(0);
  });

  it('never activates from the body alone when the reference is unknown', async () => {
    mockDb.queue('lahza_webhook_events', { data: null, error: null });
    mockDb.queue('payment_checkout_intents', { data: null, error: null });

    const res = await lahzaWebhook(webhookRequest(event()));
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe('unknown-reference');
    expect(mockDb.inserted('subscriptions')).toHaveLength(0);
  });

  it('ignores non-charge events (refunds do not change entitlement today)', async () => {
    mockDb.queue('lahza_webhook_events', { data: null, error: null });

    const res = await lahzaWebhook(webhookRequest({ event: 'refund.processed', data: { reference: REFERENCE } }));
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe('refund.processed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 500 so Lahza retries when the gateway verify call fails', async () => {
    mockDb.queue('lahza_webhook_events', { data: null, error: null });
    mockDb.queue('payment_checkout_intents', { data: intentRow(), error: null }, { data: null, error: null });
    fetchMock.mockRejectedValue(new Error('network down'));

    const res = await lahzaWebhook(webhookRequest(event()));
    expect(res.status).toBe(500);
  });
});

describe('GET /api/payments/lahza/callback', () => {
  const callbackUrl = (reference: string | null) =>
    `http://localhost/api/payments/lahza/callback${reference ? `?reference=${reference}` : ''}`;

  beforeEach(() => {
    process.env.LAHZA_SECRET_KEY = 'sk_test_abc';
  });

  it('redirects without activating when no reference is present', async () => {
    const res = await lahzaCallback(makeRequest(callbackUrl(null)));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('payment=missing_reference');
  });

  it('redirects with an explicit flag for an unknown reference', async () => {
    mockDb.queue('payment_checkout_intents', { data: null, error: null });
    const res = await lahzaCallback(makeRequest(callbackUrl('sub-nope')));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('payment=unknown_reference');
  });

  it('activates and lands on the clinic subscription page with status=success', async () => {
    mockDb.queue('payment_checkout_intents', { data: intentRow(), error: null }, { data: null, error: null });
    mockDb.queue('clinics', { data: { slug: 'hala-clinic' }, error: null });
    mockDb.queue('subscriptions', { data: null, error: null }, { data: { id: 'sub-1' }, error: null });
    fetchMock.mockResolvedValue({ ok: true, json: async () => verifyResponse() });

    const res = await lahzaCallback(makeRequest(callbackUrl(REFERENCE)));
    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/dashboard/hala-clinic/subscription');
    expect(location).toContain('status=success');
    expect(location).toContain(REFERENCE);
    expect(mockDb.inserted('subscriptions')).toHaveLength(1);
  });

  it('lands with status=failed when the gateway says the payment did not succeed', async () => {
    mockDb.queue('payment_checkout_intents', { data: intentRow(), error: null }, { data: null, error: null });
    mockDb.queue('clinics', { data: { slug: 'hala-clinic' }, error: null });
    fetchMock.mockResolvedValue({ ok: true, json: async () => verifyResponse({ status: 'failed' }) });

    const res = await lahzaCallback(makeRequest(callbackUrl(REFERENCE)));
    expect(res.status).toBe(302);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('status=failed');
    expect(mockDb.inserted('subscriptions')).toHaveLength(0);
  });

  it('reports schema_missing when the migration has not been applied', async () => {
    mockDb.queue('payment_checkout_intents', {
      data: null,
      error: { code: 'PGRST205', message: 'relation does not exist' },
    });
    const res = await lahzaCallback(makeRequest(callbackUrl(REFERENCE)));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('payment=schema_missing');
  });
});
