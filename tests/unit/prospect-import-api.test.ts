import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authorized: true,
  insertedRows: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/services/platformAdmin', () => ({
  requirePlatformAdmin: vi.fn(async () => state.authorized
    ? { ok: true, admin: { id: 'admin', user_id: 'admin-user', email: 'admin@example.test', role: 'owner' } }
    : { ok: false, status: 403 }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== 'prospects') throw new Error(`Unexpected table: ${table}`);
      return {
        insert: async (rows: Record<string, unknown>[]) => {
          state.insertedRows.push(...rows);
          return { error: null };
        },
      };
    },
  },
}));

import { POST } from '@/app/api/admin/prospects/import/route';

function request(content: string) {
  const formData = new FormData();
  formData.set('file', new File([content], 'prospects.csv', { type: 'text/csv' }));
  return new Request('https://app.test/api/admin/prospects/import', {
    method: 'POST',
    body: formData,
  });
}

describe('admin prospect CSV import headers', () => {
  beforeEach(() => {
    state.authorized = true;
    state.insertedRows = [];
  });

  it.each([
    ['imports a CSV with a UTF-8 BOM', '\uFEFFclinic_name,city\nعيادة الاختبار,عمّان\n'],
    ['imports a CSV without a BOM', 'clinic_name,city\nعيادة الاختبار,عمّان\n'],
    ['trims whitespace around header names', '  clinic_name  ,  city  \nعيادة الاختبار,عمّان\n'],
  ])('%s', async (_label, csv) => {
    const response = await POST(request(csv));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ inserted: 1, skipped: 0 });
    expect(state.insertedRows[0]).toMatchObject({
      clinic_name: 'عيادة الاختبار',
      city: 'عمّان',
      status: 'new',
    });
  });
});
