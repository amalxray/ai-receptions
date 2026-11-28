import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authorized: true,
  backup: vi.fn(),
  events: [] as string[],
  deleteCalled: false,
  updateCalled: false,
  deleteIds: [] as string[],
  deleteResult: {
    data: [] as Array<{ id: string }> | null,
    error: null as { message: string } | null,
  },
}));

vi.mock('@/lib/services/platformAdmin', () => ({
  requirePlatformAdmin: vi.fn(async () => state.authorized
    ? { ok: true, admin: { id: 'admin', user_id: 'admin-user', email: 'admin@example.test', role: 'owner' } }
    : { ok: false, status: 401 }),
}));

vi.mock('@/lib/services/prospecting/exportBackup', () => ({
  buildProspectBackupCsv: state.backup,
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== 'prospects') throw new Error(`Unexpected table: ${table}`);
      const query = {
        delete: () => {
          state.deleteCalled = true;
          state.events.push('delete');
          return query;
        },
        update: () => {
          state.updateCalled = true;
          return query;
        },
        in: (column: string, ids: string[]) => {
          expect(column).toBe('id');
          state.deleteIds = ids;
          state.events.push('in');
          return query;
        },
        select: async (columns: string) => {
          expect(columns).toBe('id');
          state.events.push('select');
          return state.deleteResult;
        },
      };
      return query;
    },
  },
}));

import { POST } from '@/app/api/admin/prospects/bulk-delete/route';

const prospectIds = [
  'd6d3ea46-074a-4fdb-b502-fd2259ab6739',
  '37a1d52b-74e8-48ef-9eaa-e2a475f4d20e',
];

function request(body: unknown) {
  return new Request('https://app.test/api/admin/prospects/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('admin prospect bulk delete API', () => {
  beforeEach(() => {
    state.authorized = true;
    state.events = [];
    state.deleteCalled = false;
    state.updateCalled = false;
    state.deleteIds = [];
    state.deleteResult = {
      data: [{ id: prospectIds[0] }, { id: prospectIds[1] }],
      error: null,
    };
    state.backup.mockReset();
    state.backup.mockImplementation(async (ids: string[]) => {
      state.events.push('backup');
      return { csv: '\uFEFFbackup', emailCount: ids.length + 2 };
    });
  });

  it('builds the backup before deleting and returns actual counts and an ISO timestamp', async () => {
    state.deleteResult.data = [{ id: prospectIds[0] }, { id: prospectIds[1] }];

    const response = await POST(request({ ids: prospectIds }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(state.events).toEqual(['backup', 'delete', 'in', 'select']);
    expect(state.backup).toHaveBeenCalledWith(prospectIds);
    expect(state.deleteIds).toEqual(prospectIds);
    expect(state.deleteCalled).toBe(true);
    expect(state.updateCalled).toBe(false);
    expect(body.deleted).toBe(state.deleteResult.data.length);
    expect(body.emails_deleted).toBe(prospectIds.length + 2);
    expect(Number.isNaN(Date.parse(body.deleted_at))).toBe(false);
    expect(body).toHaveProperty('deleted_at');
  });

  it('does not delete when backup generation fails', async () => {
    state.backup.mockRejectedValue(new Error('تعذر التصدير'));
    const response = await POST(request({ ids: prospectIds }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain('لم يُنفَّذ الحذف');
    expect(state.backup).toHaveBeenCalledOnce();
    expect(state.deleteCalled).toBe(false);
  });

  it('returns an Arabic error when deletion fails', async () => {
    state.deleteResult = { data: [{ id: prospectIds[0] }], error: { message: 'database failure' } };
    const response = await POST(request({ ids: prospectIds }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('تعذّر حذف العيادات المحددة.');
    expect(body).not.toHaveProperty('deleted');
  });

  it('rejects empty or invalid IDs without building a backup or deleting', async () => {
    const emptyResponse = await POST(request({ ids: [] }));
    const invalidResponse = await POST(request({ ids: ['not-a-uuid'] }));

    expect(emptyResponse.status).toBe(400);
    expect(invalidResponse.status).toBe(400);
    expect(state.backup).not.toHaveBeenCalled();
    expect(state.deleteCalled).toBe(false);
  });

  it('returns 401 for a non-admin without building a backup or deleting', async () => {
    state.authorized = false;
    const response = await POST(request({ ids: prospectIds }));

    expect(response.status).toBe(401);
    expect(state.backup).not.toHaveBeenCalled();
    expect(state.deleteCalled).toBe(false);
  });

  it('deduplicates IDs before backup generation and deletion', async () => {
    const ids = [prospectIds[0], prospectIds[0], prospectIds[1]];
    const response = await POST(request({ ids }));

    expect(response.status).toBe(200);
    expect(state.backup).toHaveBeenCalledWith(prospectIds);
    expect(state.deleteIds).toEqual(prospectIds);
  });
});
