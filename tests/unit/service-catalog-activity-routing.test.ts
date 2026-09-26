/**
 * B18 — `/api/clinic/services` must write the catalog that belongs to the
 * tenant's `activity_type` (the table its PUBLIC space renders), and it must
 * keep the canonical clinic_services row in sync for booking/billing/referrals.
 *
 * Regression: the endpoint hardcoded `clinic_services`, so an imaging center or
 * a dental lab edited one table while the public site rendered another — adds,
 * edits, price changes and deletes never reached the site.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: vi.fn(async () => ({ authorized: true, user: { id: 'u1' }, role: 'owner' })),
  roleDenied: () => null,
  ADMIN_ROLES: ['owner', 'manager'],
}));
vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));

type Call = { table: string; op: 'select' | 'insert' | 'update'; payload: Record<string, unknown> | null };

const state = {
  activityType: 'imaging_center' as string,
  calls: [] as Call[],
  domainLookup: null as null | { id: string; name: string },
  canonicalLookup: null as null | { id: string; name: string },
};

function builder(table: string) {
  const call: Call = { table, op: 'select', payload: null };
  state.calls.push(call);
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (payload: Record<string, unknown>) => { call.op = 'insert'; call.payload = payload; return b; },
    update: (payload: Record<string, unknown>) => { call.op = 'update'; call.payload = payload; return b; },
    eq: () => b,
    is: () => b,
    order: async () => ({ data: [], error: null }),
    maybeSingle: async () => {
      if (table === 'clinics') return { data: { activity_type: state.activityType }, error: null };
      if (table === 'clinic_services') return { data: state.canonicalLookup, error: null };
      return { data: state.domainLookup, error: null };
    },
    single: async () => ({ data: { id: `${table}-id`, deleted_at: null, ...(call.payload ?? {}) }, error: null }),
  };
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: (table: string) => builder(table) } }));

import { POST } from '@/app/api/clinic/services/route';
import { DELETE, PUT } from '@/app/api/clinic/services/[serviceId]/route';
import { imagingServicePriceLabel } from '@/components/public/ImagingPublicSpace';

const CLINIC = '11111111-1111-1111-1111-111111111111';
const SERVICE = '44444444-4444-4444-4444-444444444444';

function post(body: unknown) {
  return new Request(`http://localhost/api/clinic/services?clinic_id=${CLINIC}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}
function put(body: unknown) {
  return new Request(`http://localhost/api/clinic/services/${SERVICE}?clinic_id=${CLINIC}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}
function del() {
  return new Request(`http://localhost/api/clinic/services/${SERVICE}?clinic_id=${CLINIC}`, { method: 'DELETE' });
}
const inserts = (table: string) => state.calls.filter((c) => c.op === 'insert' && c.table === table);
const updates = (table: string) => state.calls.filter((c) => c.op === 'update' && c.table === table);

beforeEach(() => {
  state.calls = [];
  state.domainLookup = null;
  state.canonicalLookup = null;
  state.activityType = 'imaging_center';
});

describe('service catalog — activity-aware routing', () => {
  it('imaging center: creates in imaging_services AND mirrors the canonical row', async () => {
    const res = await POST(post({ name: 'أشعة مقطعية', duration_minutes: 30, price: 250 }));
    expect(res.status).toBe(201);

    const domain = inserts('imaging_services');
    expect(domain).toHaveLength(1);
    expect(domain[0].payload?.name).toBe('أشعة مقطعية');
    expect(domain[0].payload?.pricing_mode).toBe('fixed');
    // Mirrored so booking / referrals / billing still see the service.
    expect(inserts('clinic_services')[0]?.payload?.name).toBe('أشعة مقطعية');
  });

  it('dental lab: creates in lab_services (not clinic_services alone)', async () => {
    state.activityType = 'dental_lab';
    const res = await POST(post({ name: 'تركيب تاج زيركون', duration_minutes: 20, price: 400 }));
    expect(res.status).toBe(201);
    expect(inserts('lab_services')).toHaveLength(1);
    expect(inserts('imaging_services')).toHaveLength(0);
  });

  it('plain clinic: keeps writing only clinic_services (unchanged behaviour)', async () => {
    state.activityType = 'clinic';
    const res = await POST(post({ name: 'تنظيف', duration_minutes: 30, price: 100 }));
    expect(res.status).toBe(201);
    expect(inserts('clinic_services')).toHaveLength(1);
    expect(inserts('imaging_services')).toHaveLength(0);
    expect(inserts('lab_services')).toHaveLength(0);
  });

  it('imaging center: a price edit updates imaging_services and the mirror', async () => {
    state.domainLookup = { id: SERVICE, name: 'بانوراما' };
    state.canonicalLookup = { id: 'canonical-1', name: 'بانوراما' };
    const res = await PUT(put({ price: 150, duration_minutes: 15 }));
    expect(res.status).toBe(200);

    const domain = updates('imaging_services');
    expect(domain).toHaveLength(1);
    expect(domain[0].payload?.price).toBe(150);
    // A price with no mode would render NO price on the public page.
    expect(domain[0].payload?.pricing_mode).toBe('fixed');
    expect(updates('clinic_services')[0]?.payload?.price).toBe(150);
  });

  it('imaging center: a rename re-points the canonical mirror by its old name', async () => {
    state.domainLookup = { id: SERVICE, name: 'بانوراما' };
    state.canonicalLookup = { id: 'canonical-1', name: 'بانوراما' };
    const res = await PUT(put({ name: 'تصوير بانوراما كامل' }));
    expect(res.status).toBe(200);

    const mirror = updates('clinic_services')[0];
    expect(mirror?.payload?.name).toBe('تصوير بانوراما كامل');
    // The row is found by its PREVIOUS name, otherwise the mirror would be
    // orphaned and a duplicate canonical row would appear.
    expect(state.calls.some((c) => c.op === 'insert' && c.table === 'clinic_services')).toBe(false);
  });

  it('imaging center: delete removes the public row AND the canonical mirror', async () => {
    state.domainLookup = { id: SERVICE, name: 'بانوراما' };
    const res = await DELETE(del());
    expect(res.status).toBe(200);
    expect(updates('imaging_services')[0]?.payload?.deleted_at).toBeTruthy();
    expect(updates('clinic_services')[0]?.payload?.deleted_at).toBeTruthy();
  });

  it('imaging center: deleting an unknown id is a 404 (no silent success)', async () => {
    state.domainLookup = null;
    const res = await DELETE(del());
    expect(res.status).toBe(404);
  });
});

describe('public price label — legacy rows keep their price visible', () => {
  const base = { price: null, price_min: null, price_max: null, price_note: null };

  it('renders a positive price even when the mode was never set', () => {
    // "مفصل الفكين" in the live catalog: price 80 + pricing_mode 'unspecified'.
    expect(imagingServicePriceLabel({ ...base, pricing_mode: 'unspecified', price: 80 })).toBe('80 ₪');
  });

  it('keeps 0/null prices invisible (0 means "not priced")', () => {
    expect(imagingServicePriceLabel({ ...base, pricing_mode: 'unspecified', price: 0 })).toBeNull();
    expect(imagingServicePriceLabel({ ...base, pricing_mode: 'fixed', price: null })).toBeNull();
  });

  it('still prefers the priced modes and falls back to the note', () => {
    expect(imagingServicePriceLabel({ ...base, pricing_mode: 'fixed', price: 150 })).toBe('150 ₪');
    expect(imagingServicePriceLabel({ ...base, pricing_mode: 'range', price_min: 70, price_max: 300 })).toBe('70–300 ₪');
    expect(imagingServicePriceLabel({ ...base, pricing_mode: 'case_by_case', price_note: 'حسب الحالة' })).toBe('حسب الحالة');
  });
});
