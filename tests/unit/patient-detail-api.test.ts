import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * B37 — patient reachability.
 *
 * `GET /api/patients/{id}` did not exist, so the patient detail page fetched
 * `GET /api/patients` and `.find()`-ed the row. The list route caps its result at
 * the newest 50 patients (`.limit(50)`), so every patient older than the 50th
 * newest rendered as "المريض غير موجود في هذه العيادة" — the row was intact, the
 * read path was capped (amal-x-ray-center sat at 43/50 and climbing).
 *
 * These tests pin the replacement: an id-keyed read that cannot inherit the list
 * cap, stays tenant-scoped, and never leaks existence across tenants.
 */

const CID = '11111111-1111-1111-1111-111111111111';
const OTHER_CID = '22222222-2222-2222-2222-222222222222';
const PID = '33333333-3333-3333-3333-333333333333';

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  dbError: null as { message: string } | null,
  calls: [] as string[],
  filters: [] as Array<[string, unknown]>,
  authorized: true,
  authStatus: 200 as number,
  configured: true,
}));

vi.mock('@/lib/config', () => ({
  getSupabaseEnvConfig: () => ({
    isConfigured: state.configured,
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'test-anon-key',
    serviceRoleKey: 'test-service-role-key',
  }),
  isSupabaseConfigured: () => state.configured,
}));

vi.mock('@/lib/services/clinicAuthorization', () => ({
  authorizeClinicRequest: vi.fn(async () =>
    state.authorized
      ? { authorized: true, status: 200, role: 'owner', userId: 'user-1' }
      : { authorized: false, status: state.authStatus }
  ),
}));

/** Records every builder hop so tests can prove the query shape (no limit/order). */
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      state.calls.push(`from:${table}`);
      const chain: any = new Proxy(function () {}, {
        get(_target, key: string) {
          if (key === 'then') {
            return (resolve: (value: unknown) => void) => resolve({ data: state.row, error: state.dbError });
          }
          return (...args: unknown[]) => {
            state.calls.push(String(key));
            if (key === 'eq') state.filters.push([args[0] as string, args[1]]);
            return chain;
          };
        },
        apply: () => chain,
      });
      return chain;
    },
  },
}));

import { GET } from '@/app/api/patients/[patientId]/route';
import { toPatientShape } from '@/lib/services/patientShape';

function url(patientId: string | null, clinicId?: string | null) {
  const qs = clinicId === null ? '' : `?clinic_id=${encodeURIComponent(clinicId ?? CID)}`;
  return `https://app.example.com/api/patients/${patientId ?? ''}${qs}`;
}

function request(patientId: string | null, clinicId?: string | null, token = 'test-token') {
  return new Request(url(patientId, clinicId), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

/** A row as Postgres returns it: full_name / phone_number columns. */
const DB_ROW = {
  id: PID,
  clinic_id: CID,
  full_name: 'ابو خليل فريتخ',
  email: null,
  phone_number: '0599123456',
  notes: 'حساسية بنسلين',
  created_at: '2025-01-04T10:00:00.000Z',
  updated_at: '2025-01-04T10:00:00.000Z',
  metadata: { source: 'موقع الويب', status: 'معالج' },
};

beforeEach(() => {
  state.row = null;
  state.dbError = null;
  state.calls = [];
  state.filters = [];
  state.authorized = true;
  state.authStatus = 200;
  state.configured = true;
});

describe('GET /api/patients/{patientId}', () => {
  it('reads one patient by id — no list cap, no ordering (the B37 mine)', async () => {
    state.row = DB_ROW;
    const res = await GET(request(PID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(PID);
    expect(body.name).toBe('ابو خليل فريتخ');
    expect(body.phone).toBe('0599123456');
    expect(body.source).toBe('موقع الويب');
    expect(body.status).toBe('معالج');
    // The list route's `.limit(50)` + `.order(created_at)` are what made older
    // patients unreachable; an id-keyed read must never grow either.
    expect(state.calls).not.toContain('limit');
    expect(state.calls).not.toContain('order');
    expect(state.filters).toContainEqual(['id', PID]);
  });

  it('is tenant-scoped in the WHERE clause, not by post-filtering', async () => {
    state.row = DB_ROW;
    await GET(request(PID));
    expect(state.filters).toContainEqual(['clinic_id', CID]);
  });

  it('404s when the row belongs to another clinic (no existence leak)', async () => {
    state.row = null; // clinic_id filter means a foreign row simply never matches
    const res = await GET(request(PID, OTHER_CID));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Patient not found' });
    expect(state.filters).toContainEqual(['clinic_id', OTHER_CID]);
  });

  it('404s for a deleted / unknown patient', async () => {
    state.row = null;
    const res = await GET(request(PID));
    expect(res.status).toBe(404);
  });

  it('400s when clinic_id is missing', async () => {
    const res = await GET(request(PID, null));
    expect(res.status).toBe(400);
    expect(state.calls).toEqual([]); // never reaches the database
  });

  it('401s without a token and never touches the database', async () => {
    state.authorized = false;
    state.authStatus = 401;
    state.row = DB_ROW;
    const res = await GET(request(PID, undefined, ''));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(state.calls).toEqual([]);
  });

  it('403s a non-member and never touches the database', async () => {
    state.authorized = false;
    state.authStatus = 403;
    state.row = DB_ROW;
    const res = await GET(request(PID));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(state.calls).toEqual([]);
  });

  it('404s a malformed id instead of letting Postgres 500 on a uuid cast', async () => {
    state.row = DB_ROW;
    const res = await GET(request('not-a-uuid'));
    expect(res.status).toBe(404);
    // Guarded AFTER authorization (so nothing is disclosed to anonymous callers)
    // but BEFORE the query (so no 22P02 invalid-input-syntax 500).
    expect(state.calls.filter((c) => c.startsWith('from:'))).toEqual([]);
  });

  it('500s on a genuine database error', async () => {
    state.dbError = { message: 'could not serialize access' };
    const res = await GET(request(PID));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'could not serialize access' });
  });

  it('serves the demo store when Supabase is unconfigured — and 404s unknown ids', async () => {
    state.configured = false;
    const res = await GET(request(PID));
    expect(res.status).toBe(404);
    expect(state.calls).toEqual([]);
  });

  it('returns exactly the shared patient shape the list route returns', async () => {
    state.row = DB_ROW;
    const body = await (await GET(request(PID))).json();
    expect(Object.keys(body).sort()).toEqual(Object.keys(toPatientShape({ id: PID, clinic_id: CID })).sort());
  });
});

describe('B37 source guards', () => {
  const root = path.resolve(process.cwd());

  it('patients list route keeps using the shared mapper (no shape drift)', () => {
    const src = fs.readFileSync(path.join(root, 'app/api/patients/route.ts'), 'utf8');
    expect(src).toContain("import { toPatientShape } from '@/lib/services/patientShape'");
    expect(src).not.toMatch(/function toPatientShape/);
  });

  it('detail page reads the single-patient endpoint instead of list + find', () => {
    const src = fs.readFileSync(
      path.join(root, 'app/(dashboard)/dashboard/[clinicSlug]/patients/[patientId]/page.tsx'),
      'utf8'
    );
    expect(src).toContain('/api/patients/${encodeURIComponent(patientId)}');
    expect(src).not.toMatch(/list\.find\(\(p\) => p\.id === patientId\)/);
    expect(src).not.toMatch(/fetch\(`\/api\/patients\?clinic_id/);
  });
});
