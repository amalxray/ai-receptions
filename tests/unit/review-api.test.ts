import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as publicPOST, GET as publicGET } from '@/app/api/public/reviews/route';
import { DELETE as deleteReview } from '@/app/api/clinic/reviews/[id]/route';
import { POST as publishReview } from '@/app/api/clinic/reviews/[id]/publish/route';
import { POST as rejectReview } from '@/app/api/clinic/reviews/[id]/reject/route';
import { GET as statsGET } from '@/app/api/clinic/reviews/stats/route';

/** Phase 1 Reviews — API contract (no network). Supabase = queue chain mock. */
const CID = '11111111-1111-1111-1111-111111111111';
const RID = '22222222-2222-2222-2222-222222222222';

const h = vi.hoisted(() => {
  const st = {
    queue: [] as string[],
    tables: [] as string[],
    chains: [] as any[],
    clinicResult: { data: null as any, error: null as any },
    reviewResult: { data: null as any, error: null as any },
    insertResult: { data: null as any, error: null as any },
    updateResult: { data: null as any, error: null as any },
    insertResults: [] as Array<{ data: any; error: any }>,
    listResult: { data: [] as any[], error: null as any, count: null as number | null },
    lastInsert: null as any,
    lastUpdate: null as any,
    checkRate: vi.fn(),
    authorize: vi.fn(),
    logEvent: vi.fn(),
    from: vi.fn(),
  };
  const results: Record<string, () => any> = {
    clinic: () => st.clinicResult,
    review: () => st.reviewResult,
    insert: () => st.insertResult,
    update: () => st.updateResult,
    list: () => st.listResult,
  };
  function chainFor(key: string) {
    const result = () => key === 'insert' && st.insertResults.length > 0
      ? st.insertResults.shift()!
      : results[key]!();
    const q: any = { __eqs: [] as any[][], __range: null as number[] | null };
    q.select = vi.fn(() => q);
    q.insert = vi.fn((payload: any) => { st.lastInsert = payload; return q; });
    q.update = vi.fn((payload: any) => { st.lastUpdate = payload; return q; });
    q.eq = vi.fn((k: any, v: any) => { q.__eqs.push([k, v]); return q; });
    q.is = vi.fn(() => q);
    q.gte = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.range = vi.fn((a: number, b: number) => { q.__range = [a, b]; return q; });
    q.limit = vi.fn(() => q);
    q.maybeSingle = vi.fn(async () => result());
    q.single = vi.fn(async () => result());
    q.then = (ok: any, no: any) => Promise.resolve(result()).then(ok, no);
    st.chains.push(q);
    return q;
  }
  st.from = vi.fn((table: string) => {
    st.tables.push(String(table));
    const key = st.queue.shift();
    if (!key) throw new Error(`Unexpected supabase .from(${table}) — queue empty`);
    return chainFor(key);
  });
  return st;
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: h.from } }));
vi.mock('@/lib/server/logging', () => ({ logEvent: h.logEvent }));
vi.mock('@/lib/services/reviewRateLimit', () => ({
  sha256: (value: string) => `hash:${String(value).trim().toLowerCase()}`,
  checkReviewRateLimit: h.checkRate,
}));
vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: h.authorize,
  roleDenied: (auth: any, roles: readonly string[]) =>
    !auth.authorized
      ? { authorized: false, status: (auth.status ?? 401) }
      : !roles.includes(auth.role ?? '')
        ? { authorized: false, status: 403 }
        : null,
  ADMIN_ROLES: ['owner', 'manager'],
}));

function postReq(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/public/reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  });
}

const baseBody = { clinic_slug: 'amal-x-ray-center', rating: 5, author_name: 'سارة' };

beforeEach(() => {
  vi.clearAllMocks();
  h.queue = [];
  h.tables = [];
  h.chains = [];
  h.clinicResult = { data: { id: CID }, error: null };
  h.reviewResult = { data: { id: RID, clinic_id: CID, deleted_at: null }, error: null };
  h.insertResult = { data: { id: 'rev-1', is_published: true, flagged_medical: false }, error: null };
  h.insertResults = [];
  h.updateResult = { data: { id: RID, is_published: true }, error: null };
  h.listResult = { data: [], error: null, count: 0 };
  h.lastInsert = null;
  h.lastUpdate = null;
  h.checkRate.mockResolvedValue({ allowed: true, scope: null });
  h.authorize.mockResolvedValue({ authorized: true, role: 'owner' });
});

describe('POST /api/public/reviews', () => {
  it('1. 201 سليم → is_published=true (Hybrid)', async () => {
    h.queue = ['clinic', 'insert'];
    const res = await publicPOST(postReq({ ...baseBody, comment: 'خدمة ممتازة والاستقبال سريع' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.is_published).toBe(true);
    expect(body.data.flagged_medical).toBe(false);
    expect(h.lastInsert.is_published).toBe(true);
    expect(h.lastInsert.flag_reason).toBeNull();
  });

  it('2. مُعلَّم طبياً → is_published=false + reason', async () => {
    h.queue = ['clinic', 'insert'];
    const res = await publicPOST(postReq({ ...baseBody, comment: 'شفيت بعد الجلسة' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.is_published).toBe(false);
    expect(body.data.flagged_medical).toBe(true);
    expect(h.lastInsert.is_published).toBe(false);
    expect(h.lastInsert.flag_reason).toBe('ادعاء شفاء طبي');
    expect(h.lastInsert.published_at).toBeNull();
  });

  it('3. rating=6 → 400 (validation قبل أي DB)', async () => {
    const res = await publicPOST(postReq({ ...baseBody, rating: 6 }));
    expect(res.status).toBe(400);
    expect(h.from).not.toHaveBeenCalled();
  });

  it('4. clinic غير موجود → 404', async () => {
    h.queue = ['clinic'];
    h.clinicResult = { data: null, error: null };
    const res = await publicPOST(postReq(baseBody));
    expect(res.status).toBe(404);
  });

  it('5. rate-limit مرفوض → 429 + لا إدراج', async () => {
    h.queue = ['clinic'];
    h.checkRate.mockResolvedValueOnce({ allowed: false, scope: 'ip' });
    const res = await publicPOST(postReq(baseBody));
    expect(res.status).toBe(429);
    expect(h.lastInsert).toBeNull();
    expect(h.logEvent.mock.calls.some((c) => c[0] === 'review_rate_limited')).toBe(true);
  });

  it('6. sanitizePII مطبّق — لا رقم خام في DB + flag_reason PII', async () => {
    h.queue = ['clinic', 'insert'];
    const res = await publicPOST(postReq({ ...baseBody, comment: 'اتصلوا بي على 059-270-1077' }));
    expect(res.status).toBe(201);
    expect(h.lastInsert.comment).toBe('اتصلوا بي على [***]');
    expect(h.lastInsert.comment).not.toContain('059');
    expect(h.lastInsert.flag_reason).toBe('PII تم إخفاؤه');
    expect(h.lastInsert.is_published).toBe(true); // PII لا يحجب
  });

  it('7. source=booking falls back to legacy-safe chat when the database check is outdated', async () => {
    h.queue = ['clinic', 'insert', 'insert'];
    h.insertResults = [
      { data: null, error: { code: '23514', message: 'violates check constraint "clinic_reviews_source_check"' } },
      { data: { id: 'rev-compat', is_published: true, flagged_medical: false }, error: null },
    ];

    const res = await publicPOST(postReq({ ...baseBody, source: 'booking' }));

    expect(res.status).toBe(201);
    expect(h.lastInsert.source).toBe('chat');
    expect(h.logEvent.mock.calls.some((call) => call[0] === 'review_booking_source_compat_fallback')).toBe(true);
  });
});

describe('GET /api/public/reviews', () => {
  it('7. 200 — published فقط (is_published=true في الاستعلام)', async () => {
    h.queue = ['clinic', 'list'];
    h.listResult = {
      data: [{ id: 'r1', rating: 5, author_name: 'A', comment: null, is_verified: false, created_at: '2026-10-20T00:00:00Z' }],
      error: null,
      count: 1,
    };
    const res = await publicGET(new Request('http://localhost/api/public/reviews?clinic=amal-x-ray-center'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.total).toBe(1);
    expect(h.chains[1].__eqs).toContainEqual(['is_published', true]);
    expect(h.tables).toEqual(['clinics', 'clinic_reviews']);
  });

  it('8. pagination يعمل: limit=5&offset=10 → range(10,14)', async () => {
    h.queue = ['clinic', 'list'];
    const res = await publicGET(
      new Request('http://localhost/api/public/reviews?clinic=amal-x-ray-center&limit=5&offset=10'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.limit).toBe(5);
    expect(body.data.offset).toBe(10);
    expect(h.chains[1].__range).toEqual([10, 14]);
  });
});

describe('clinic routes — publish / reject / delete / stats', () => {
  it('9. DELETE → 200 + soft delete (deleted_at)', async () => {
    h.queue = ['review', 'update'];
    h.updateResult = { data: null, error: null };
    const res = await deleteReview(new Request('http://localhost/api/clinic/reviews/x', { method: 'DELETE' }), { params: { id: RID } });
    expect(res.status).toBe(200);
    expect(String(h.lastUpdate.deleted_at ?? '')).not.toBe('');
    expect(h.chains[1].__eqs).toContainEqual(['id', RID]);
  });

  it('10. publish → 200 + is_published=true + published_at', async () => {
    h.queue = ['review', 'update'];
    h.updateResult = { data: { id: RID, is_published: true }, error: null };
    const res = await publishReview(new Request('http://localhost/api/clinic/reviews/p', { method: 'POST' }), { params: { id: RID } });
    expect(res.status).toBe(200);
    expect(h.lastUpdate.is_published).toBe(true);
    expect(String(h.lastUpdate.published_at ?? '')).not.toBe('');
    expect(h.lastUpdate.rejected_at).toBeNull();
  });

  it('11. reject → 200 + is_published=false + rejected_at', async () => {
    h.queue = ['review', 'update'];
    h.updateResult = { data: { id: RID, is_published: false }, error: null };
    const res = await rejectReview(new Request('http://localhost/api/clinic/reviews/r', { method: 'POST' }), { params: { id: RID } });
    expect(res.status).toBe(200);
    expect(h.lastUpdate.is_published).toBe(false);
    expect(String(h.lastUpdate.rejected_at ?? '')).not.toBe('');
  });

  it('12. stats → 200 متوسط + توزيع (منشور فقط)', async () => {
    h.queue = ['list'];
    h.listResult = {
      data: [{ rating: 5 }, { rating: 5 }, { rating: 4 }, { rating: 3 }, { rating: 5 }],
      error: null,
      count: 5,
    };
    const res = await statsGET(new Request(`http://localhost/api/clinic/reviews/stats?clinic_id=${CID}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(5);
    expect(body.data.average).toBe(4.4);
    expect(body.data.distribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 1, 5: 3 });
    expect(h.chains[0].__eqs).toContainEqual(['is_published', true]);
  });

  it('13. غير admin (role=viewer) → 403', async () => {
    h.queue = ['review', 'update'];
    h.authorize.mockResolvedValue({ authorized: true, role: 'viewer' });
    const res = await publishReview(new Request('http://localhost/api/clinic/reviews/p', { method: 'POST' }), { params: { id: RID } });
    expect(res.status).toBe(403);
    expect(h.lastUpdate).toBeNull(); // gate قبل أي كتابة
  });

  it('14. غير عضو: 401 (unauthorized) و 403 (status موروث)', async () => {
    h.queue = ['review', 'update'];
    h.authorize.mockResolvedValueOnce({ authorized: false, status: 401 });
    const res401 = await deleteReview(new Request('http://localhost/api/clinic/reviews/x', { method: 'DELETE' }), { params: { id: RID } });
    expect(res401.status).toBe(401);

    h.authorize.mockResolvedValueOnce({ authorized: false, status: 403 });
    const res403 = await publishReview(new Request('http://localhost/api/clinic/reviews/p', { method: 'POST' }), { params: { id: RID } });
    expect(res403.status).toBe(403);
  });
});
