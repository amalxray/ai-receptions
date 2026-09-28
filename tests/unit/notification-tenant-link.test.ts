import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * B20 — the notification → dashboard deep link.
 *
 * Stored notification rows pointed at `/dashboard/{clinic_id}/{module}` where the
 * module (`accounting/invoices`, `chat`) has no tenant page: "عرض نص الإشعار"
 * landed on the 404 page. The fix has three parts, each asserted here:
 *   1. `resolveTenantAccess` accepts a clinic uuid as a ROUTING alias for the slug
 *      (so already-stored links resolve) while membership stays mandatory,
 *   2. producers build canonical `/dashboard/{slug}/{module}` links,
 *   3. the notifications read layer maps the historic module segments to live
 *      pages — the only way to fix rows already in the database without a data
 *      migration.
 */

const CLINIC_ID = 'ab05e3b9-8242-40e5-9392-aa412c8d9af4';
const USER_ID = 'user-1';

const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  user: { id: 'user-1' } as { id: string } | null,
}));

/**
 * Infinite-chain thenable builder: records every filter call (table + method +
 * args) so a test can assert the EXACT PostgREST expression, and resolves the
 * awaited chain with `state.rows[table]`.
 */
function chainFrom(state: { rows: Record<string, unknown>; calls: Array<{ table: string; method: string; args: unknown[] }> }) {
  return (table: string) => {
    const payload = () => ({ data: state.rows[table] ?? null, error: null, count: null });
    const proxy: any = new Proxy(function () {}, {
      get(_t, key) {
        if (key === 'then') return (res: (v: unknown) => void) => res(payload());
        return (...args: unknown[]) => {
          state.calls.push({ table, method: String(key), args });
          return proxy;
        };
      },
      apply() { return proxy; },
    });
    return proxy;
  };
}

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: chainFrom(state) } }));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  }),
}));
vi.mock('@/lib/config', () => ({
  getSupabaseEnvConfig: () => ({
    isConfigured: true,
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'test-service-role-key',
  }),
}));

import { NextRequest } from 'next/server';
import { resolveTenantAccess, getClinicSlugById } from '@/lib/services/tenantAccess';
import { GET as getNotificationsRoute } from '@/app/api/clinic/notifications/route';

const projectRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

describe('B20 — resolveTenantAccess accepts the uuid tenant token', () => {
  beforeEach(() => {
    state.calls = [];
    state.user = { id: USER_ID };
    state.rows = {
      clinics: { id: CLINIC_ID, slug: 'hala-clinic', name: 'عيادة هالة' },
      clinic_users: { role: 'owner' },
    };
  });

  it('resolves the uuid stored in historic links to the real clinic row', async () => {
    const result = await resolveTenantAccess(CLINIC_ID);
    expect(result).toEqual({
      ok: true,
      status: 200,
      clinicId: CLINIC_ID,
      clinic: { id: CLINIC_ID, slug: 'hala-clinic', name: 'عيادة هالة' },
      role: 'owner',
    });
    const filter = state.calls.find((c) => c.table === 'clinics' && c.method === 'or');
    expect(filter?.args[0]).toBe(`slug.eq.${CLINIC_ID},id.eq.${CLINIC_ID}`);
  });

  it('keeps the canonical slug lookup unchanged', async () => {
    const result = await resolveTenantAccess('hala-clinic');
    expect(result.ok).toBe(true);
    const filter = state.calls.find((c) => c.table === 'clinics' && c.method === 'or');
    expect(filter?.args[0]).toBe('slug.eq.hala-clinic');
  });

  it('still demands an ACTIVE membership — a uuid alias grants nothing by itself', async () => {
    state.rows.clinic_users = null;
    const result = await resolveTenantAccess(CLINIC_ID);
    expect(result).toMatchObject({ ok: false, status: 403 });
    const membership = state.calls.filter((c) => c.table === 'clinic_users' && c.method === 'eq');
    expect(membership.map((c) => c.args)).toEqual([
      ['clinic_id', CLINIC_ID],
      ['user_id', USER_ID],
    ]);
  });

  it('requires authentication before any clinic lookup', async () => {
    state.user = null;
    const result = await resolveTenantAccess(CLINIC_ID);
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(state.calls.filter((c) => c.table === 'clinics')).toHaveLength(0);
  });

  it('rejects a token that is neither slug nor uuid — no filter metacharacters', async () => {
    const result = await resolveTenantAccess('a,id.ne.hala-clinic');
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(state.calls.filter((c) => c.table === 'clinics')).toHaveLength(0);
  });
});

describe('B20 — getClinicSlugById (producer link builder)', () => {
  beforeEach(() => {
    state.calls = [];
    state.rows = { clinics: { slug: 'hala-clinic' } };
  });

  it('returns the slug for a clinic id', async () => {
    expect(await getClinicSlugById(CLINIC_ID)).toBe('hala-clinic');
  });

  it('degrades to null (never throws) when the row is missing or the id is empty', async () => {
    state.rows.clinics = null;
    expect(await getClinicSlugById(CLINIC_ID)).toBeNull();
    expect(await getClinicSlugById('')).toBeNull();
    expect(await getClinicSlugById(undefined)).toBeNull();
  });
});

describe('B20 — the notifications read path maps stored links to live pages', () => {
  const invoiceLink = `/dashboard/${CLINIC_ID}/accounting/invoices/57877870-1b48-4f61-9c1c-0f0a1d2e3f40`;
  const referralLink = '/dashboard/hala-clinic/referrals/bb8c3dd6-1f2e-4a3b-9c4d-5e6f7a8b9c0d';

  /** Row builder — only the id and `payload.link` matter for these assertions. */
  const row = (id: string, link: unknown, status = 'unread') => ({
    id,
    clinic_id: CLINIC_ID,
    type: 'system',
    channel: 'inapp',
    status,
    created_at: '2026-09-28T00:00:00.000Z',
    payload: link === undefined ? { title: 'إشعار' } : { title: 'إشعار', link },
  });

  /** Reads through the REAL GET handler and returns the link of each row. */
  async function fetchLinks(rows: unknown[]): Promise<unknown[]> {
    state.rows = { notifications: rows };
    const request = new NextRequest(`http://localhost/api/clinic/notifications?clinic_id=${CLINIC_ID}`);
    const res = await getNotificationsRoute(request);
    const json = (await res.json()) as { notifications: Array<{ payload?: { link?: unknown } }> };
    return json.notifications.map((n) => n.payload?.link ?? null);
  }

  it('sends the stored invoice notifications to the financial-intelligence module', async () => {
    const [link] = await fetchLinks([row('n1', invoiceLink)]);
    expect(link).toBe(`/dashboard/${CLINIC_ID}/financial-intelligence`);
  });

  it('repairs the legacy /chat?conversation= deep link', async () => {
    const [withId, withoutId] = await fetchLinks([
      row('n1', `/dashboard/${CLINIC_ID}/chat?conversation=conv-1`),
      row('n2', '/dashboard/hala-clinic/chat'),
    ]);
    expect(withId).toBe(`/dashboard/${CLINIC_ID}/conversations/conv-1`);
    expect(withoutId).toBe('/dashboard/hala-clinic/conversations');
  });

  it('leaves links that already work untouched, and rows without a link intact', async () => {
    const untouched = [
      '/dashboard/hala-clinic/appointments',
      referralLink,
      `/dashboard/${CLINIC_ID}/appointments`,
      '/dashboard/notifications',
      '/pricing',
    ];
    const links = await fetchLinks([...untouched.map((l, i) => row(`u${i}`, l)), row('u9', undefined)]);
    expect(links).toEqual([...untouched, null]);
  });

  it('never invents a path: an unknown module stays as stored', async () => {
    const [link] = await fetchLinks([row('n1', `/dashboard/${CLINIC_ID}/unknown-module/1`)]);
    expect(link).toBe(`/dashboard/${CLINIC_ID}/unknown-module/1`);
  });
});

describe('B20 — producers build canonical tenant links', () => {
  const producers: Array<[string, string]> = [
    ['app/api/booking/route.ts', 'appointments'],
    ['app/api/booking/cancel/route.ts', 'appointments'],
    ['app/api/public/booking/reschedule/route.ts', 'appointments'],
    ['app/api/clinic/accounting/payments/route.ts', 'financial-intelligence'],
    ['app/api/public/ai/messages/route.ts', 'conversations'],
  ];

  it.each(producers)('%s links through tenantDashboardUrl(%s)', (file, module) => {
    const src = read(file);
    expect(src).toContain("from '@/lib/services/dashboardPaths'");
    expect(src).toContain('tenantDashboardUrl(');
    expect(src).toContain(`'${module}'`);
    // a hand-built `/dashboard/${...}` path must not come back
    expect(src).not.toMatch(/\/dashboard\/\$\{/);
  });

  it('the notifications read layer rewrites stored links (fix for rows already in the DB)', () => {
    const src = read('app/api/clinic/notifications/route.ts');
    expect(src).toContain('function normalizeNotificationLink(');
    expect(src).toContain('payload: withNormalizedLink(n.payload)');
  });
});
