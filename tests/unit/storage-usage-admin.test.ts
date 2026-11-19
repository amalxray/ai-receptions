import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  gate: null as null | {
    ok: true;
    admin: { id: string; user_id: string; email: string; role: string };
  } | {
    ok: false;
    status: number;
  },
  calls: [] as Array<{ table: string; method: string; value?: unknown }>,
  responses: {} as Record<string, { data: unknown; error: null | { message: string } }>,
}));

vi.mock('@/lib/services/platformAdmin', () => ({
  requirePlatformAdmin: vi.fn(async () => state.gate),
}));

vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => state.responses[table] ?? { data: null, error: null },
        upsert: (value: unknown) => {
          state.calls.push({ table, method: 'upsert', value });
          return query;
        },
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(state.responses[table] ?? { data: [], error: null }).then(resolve, reject),
      };
      return query;
    },
  },
}));

import { GET, PUT } from '@/app/api/admin/storage-usage/route';

describe('admin storage usage API', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_STORAGE_QUOTA_BYTES', '');
    state.gate = { ok: true, admin: { id: 'admin', user_id: 'admin-user', email: 'admin@example.test', role: 'owner' } };
    state.calls = [];
    state.responses = {
      storage_project_usage_snapshots: {
        data: {
          total_bytes: 4096,
          object_count: 2,
          unknown_size_object_count: 0,
          unclassified_bytes: 1024,
          unclassified_object_count: 1,
          measured_at: '2026-11-18T00:00:00.000Z',
        },
        error: null,
      },
      clinics: { data: [{ id: 'clinic-1', name: 'Clinic One' }], error: null },
      clinic_storage_limits: {
        data: [{
          clinic_id: 'clinic-1',
          soft_limit_bytes: 2048,
          warning_percent: 80,
          notification_email: null,
          last_alert_sent_at: null,
        }],
        error: null,
      },
      clinic_storage_usage_snapshots: {
        data: [{
          clinic_id: 'clinic-1',
          total_bytes: 1024,
          object_count: 1,
          unknown_size_object_count: 0,
          measured_at: '2026-11-18T00:00:00.000Z',
        }],
        error: null,
      },
    };
  });

  it('reports project capacity as unconfigured instead of inventing a quota', async () => {
    const response = await GET(new Request('https://app.test/api/admin/storage-usage'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.project_capacity_configured).toBe(false);
    expect(body.data.project.capacity_bytes).toBeNull();
    expect(body.data.project.percent_used).toBeNull();
    expect(body.data.project.total_bytes).toBe(4096);
  });

  it('only lets a platform admin configure an optional, bounded tenant limit', async () => {
    const response = await PUT(new Request('https://app.test/api/admin/storage-usage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_id: '14f6ad3a-f9bf-4108-a809-7e96ad3e2bf5',
        soft_limit_bytes: 1024,
        warning_percent: 75,
        notification_email: 'owner@example.test',
      }),
    }));

    expect(response.status).toBe(200);
    expect(state.calls).toEqual([{
      table: 'clinic_storage_limits',
      method: 'upsert',
      value: expect.objectContaining({ soft_limit_bytes: 1024, warning_percent: 75 }),
    }]);
  });

  it('does not expose or update usage to non-platform users', async () => {
    state.gate = { ok: false, status: 401 };
    const response = await GET(new Request('https://app.test/api/admin/storage-usage'));

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('Unauthorized');
  });
});
