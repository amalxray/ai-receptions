import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Clinic provisioning — Cloudflare mailbox rules + persistence into
 * `clinics.settings.tenant`.
 *
 * Live-verified Cloudflare behaviors are encoded here: 409/code 2014 on a
 * duplicate literal rule (→ idempotent success), 400/code 2054 for an
 * unverified destination (→ needsVerification), no server-side local-part
 * validation (→ we reject `bad_local!` ourselves).
 */

const { state, chain } = vi.hoisted(() => {
  const state: {
    row: unknown;
    readError: unknown;
    updateError: unknown;
    updates: Array<Record<string, unknown>>;
  } = { row: null, readError: null, updateError: null, updates: [] };

  const eqResult: Record<string, unknown> = {
    maybeSingle: async () => ({ data: state.row, error: state.readError ?? null }),
  };
  // The update chain is awaited directly (`await .update(…).eq(…)`), so the
  // eq result must be thenable for that path while still exposing
  // maybeSingle() for the read path.
  eqResult.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ error: state.updateError ?? null }).then(onFulfilled, onRejected);

  const obj: Record<string, unknown> = {
    select: () => obj,
    update: (payload: Record<string, unknown>) => {
      state.updates.push(payload);
      return obj;
    },
    eq: () => eqResult,
  };
  return { state, chain: obj };
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: () => chain },
}));

import { createClinicEmailRule } from '@/lib/cloudflare/email';
import {
  persistClinicProvisioning,
  getClinicProvisioning,
  SETTINGS_TENANT_KEY,
} from '@/lib/services/clinicProvisioning';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  state.row = null;
  state.readError = null;
  state.updateError = null;
  state.updates = [];
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('CLOUDFLARE_API_TOKEN', 'cf-test-token');
  vi.stubEnv('CLOUDFLARE_ZONE_ID', 'zone-test-id');
  vi.stubEnv('CLINIC_MAIL_FORWARD_TO', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('createClinicEmailRule', () => {
  it('rejects an invalid local part before touching the API', async () => {
    const result = await createClinicEmailRule('bad_local!');
    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_LOCAL_PART');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects platform-owned mailboxes', async () => {
    for (const local of ['info', 'support', 'admin', 'noreply', 'billing']) {
      const result = await createClinicEmailRule(local);
      expect(result.success).toBe(false);
      expect(result.error).toBe('PLATFORM_MAILBOX_RESERVED');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports missing Cloudflare credentials as config error', async () => {
    vi.stubEnv('CLOUDFLARE_API_TOKEN', '');
    const result = await createClinicEmailRule('hala-clinic', 'owner@example.com');
    expect(result.success).toBe(false);
    expect(result.error).toBe('CLOUDFLARE_CREDENTIALS_MISSING');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a missing destination as config error', async () => {
    const result = await createClinicEmailRule('hala-clinic');
    expect(result.success).toBe(false);
    expect(result.error).toBe('DESTINATION_MISSING');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a literal forwarding rule toward the given destination', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ result: { id: 'rule-1' } }), { status: 200 })
    );

    const result = await createClinicEmailRule('hala-clinic', 'owner@example.com');

    expect(result).toMatchObject({ success: true, address: 'hala-clinic@dentairec.com', ruleId: 'rule-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/zones/zone-test-id/email/routing/rules');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.matchers).toEqual([
      { type: 'literal', field: 'to', value: 'hala-clinic@dentairec.com' },
    ]);
    expect(body.actions).toEqual([{ type: 'forward', value: ['owner@example.com'] }]);
  });

  it('treats a duplicate rule (409 + CF 2014) as idempotent success', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errors: [{ code: 2014, message: 'already exists' }] }), { status: 409 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: [{ id: 'rule-9', matchers: [{ type: 'literal', field: 'to', value: 'hala-clinic@dentairec.com' }] }],
          }),
          { status: 200 }
        )
      );

    const result = await createClinicEmailRule('hala-clinic', 'owner@example.com');

    expect(result).toMatchObject({ success: true, alreadyExisted: true, ruleId: 'rule-9' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('flags an unverified destination (400 + CF 2054) as needsVerification', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ code: 2054, message: 'not verified' }] }), { status: 400 })
    );

    const result = await createClinicEmailRule('hala-clinic', 'owner@example.com');

    expect(result.success).toBe(false);
    expect(result.needsVerification).toBe(true);
    expect(result.code).toBe('needs_verification');
  });

  it('maps auth failures to a forbidden code', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ errors: [] }), { status: 403 }));
    const result = await createClinicEmailRule('hala-clinic', 'owner@example.com');
    expect(result.success).toBe(false);
    expect(result.code).toBe('forbidden');
  });

  it('survives network errors without throwing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const result = await createClinicEmailRule('hala-clinic', 'owner@example.com');
    expect(result.success).toBe(false);
    expect(result.code).toBe('network');
  });

describe('persistClinicProvisioning / getClinicProvisioning', () => {
  it('merges the patch into settings.tenant without touching sibling settings keys', async () => {
    state.row = {
      settings: {
        receptionist_name: 'سارة',
        tenant: { subdomain: 'hala-clinic.dentairec.com', subdomain_status: 'failed' },
      },
    };

    const ok = await persistClinicProvisioning('clinic-1', { subdomain_status: 'active' });

    expect(ok).toBe(true);
    expect(state.updates).toHaveLength(1);
    const settings = state.updates[0].settings as Record<string, unknown>;
    // sibling key preserved
    expect(settings.receptionist_name).toBe('سارة');
    // tenant merged (old keys kept, patch applied, timestamp stamped)
    expect(settings.tenant).toMatchObject({
      subdomain: 'hala-clinic.dentairec.com',
      subdomain_status: 'active',
      provisioned_at: expect.any(String),
    });
  });

  it('creates the tenant key from scratch when settings is empty', async () => {
    state.row = { settings: null };

    const ok = await persistClinicProvisioning('clinic-1', {
      mailbox: 'hala@dentairec.com',
      mailbox_status: 'active',
    });

    expect(ok).toBe(true);
    const settings = state.updates[0].settings as Record<string, unknown>;
    expect(settings.tenant).toMatchObject({
      mailbox: 'hala@dentairec.com',
      mailbox_status: 'active',
      provisioned_at: expect.any(String),
    });
  });

  it('returns false (never throws) when the clinic row is missing', async () => {
    state.row = null;
    await expect(persistClinicProvisioning('missing', { subdomain_status: 'active' })).resolves.toBe(false);
    expect(state.updates).toHaveLength(0);
  });

  it('returns false when the read fails', async () => {
    state.readError = 'rls denied';
    await expect(persistClinicProvisioning('clinic-1', {})).resolves.toBe(false);
  });

  it('returns false when the update fails', async () => {
    state.row = { settings: {} };
    state.updateError = 'write rejected';
    await expect(persistClinicProvisioning('clinic-1', {})).resolves.toBe(false);
  });

  it('getClinicProvisioning returns the tenant state and undefined when absent', async () => {
    state.row = { settings: { tenant: { subdomain: 'x.dentairec.com', subdomain_status: 'active' } } };
    await expect(getClinicProvisioning('clinic-1')).resolves.toMatchObject({
      subdomain: 'x.dentairec.com',
      subdomain_status: 'active',
    });

    state.row = { settings: {} };
    await expect(getClinicProvisioning('clinic-1')).resolves.toBeUndefined();

    state.row = null;
    await expect(getClinicProvisioning('clinic-1')).resolves.toBeUndefined();
  });
});

});
