import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authorized: true,
  archivedIds: [] as string[],
  update: null as null | { status: string },
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
      const query = {
        update: (value: { status: string }) => {
          state.update = value;
          return query;
        },
        in: (_column: string, ids: string[]) => {
          state.archivedIds = ids;
          return query;
        },
        select: async () => ({ data: state.archivedIds.map((id) => ({ id })), error: null }),
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

function request(ids: unknown) {
  return new Request('https://app.test/api/admin/prospects/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

describe('admin prospect bulk delete API', () => {
  beforeEach(() => {
    state.authorized = true;
    state.archivedIds = [];
    state.update = null;
  });

  it('archives only the requested IDs and returns the affected count', async () => {
    const response = await POST(request(prospectIds));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(state.update).toEqual({ status: 'archived' });
    expect(state.archivedIds).toEqual(prospectIds);
    expect(body).toEqual({ deleted: 2 });
  });

  it('deduplicates IDs before updating', async () => {
    const response = await POST(request([prospectIds[0], prospectIds[0]]));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(state.archivedIds).toEqual([prospectIds[0]]);
    expect(body.deleted).toBe(1);
  });

  it('rejects invalid IDs and more than 200 records', async () => {
    const invalidIdResponse = await POST(request(['not-a-uuid']));
    const oversizedResponse = await POST(request(Array.from({ length: 201 }, (_, index) =>
      `${String(index).padStart(8, '0')}-074a-4fdb-b502-fd2259ab6739`,
    )));

    expect(invalidIdResponse.status).toBe(400);
    expect(oversizedResponse.status).toBe(400);
    expect(state.update).toBeNull();
  });

  it('does not archive prospects for a non-admin', async () => {
    state.authorized = false;
    const response = await POST(request(prospectIds));

    expect(response.status).toBe(403);
    expect(state.update).toBeNull();
  });
});
