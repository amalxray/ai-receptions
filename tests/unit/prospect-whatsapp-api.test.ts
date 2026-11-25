import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  authorized: true,
  prospect: {
    id: 'd6d3ea46-074a-4fdb-b502-fd2259ab6739',
    status: 'new',
    metadata: { source: 'manual', whatsapp_sent: 2 },
  },
  update: null as null | { metadata: Record<string, unknown>; status: string },
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
      type Query = {
        select: (columns?: string) => Query;
        eq: (column: string, value: string) => Query;
        maybeSingle: () => Promise<{ data: typeof state.prospect | null; error: null }>;
        update: (value: { metadata: Record<string, unknown>; status: string }) => Query;
        single: () => Promise<{ data: unknown; error: null }>;
      };
      const query: Query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: state.prospect, error: null }),
        update: (value) => {
          state.update = value;
          return query;
        },
        single: async () => ({
          data: state.update ? { id: state.prospect.id, ...state.update } : null,
          error: null,
        }),
      };
      return query;
    },
  },
}));

import { PATCH } from '@/app/api/admin/prospects/[id]/route';

const prospectId = state.prospect.id;
const context = { params: { id: prospectId } };

function patch(action: string) {
  return PATCH(new Request(`https://app.test/api/admin/prospects/${prospectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  }), context);
}

describe('admin prospect WhatsApp tracking API', () => {
  beforeEach(() => {
    state.authorized = true;
    state.prospect = {
      id: prospectId,
      status: 'new',
      metadata: { source: 'manual', whatsapp_sent: 2 },
    };
    state.update = null;
  });

  it('records a WhatsApp attempt, increments the count and contacts a new prospect', async () => {
    const response = await patch('opened');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(state.update?.status).toBe('contacted');
    expect(state.update?.metadata).toMatchObject({ source: 'manual', whatsapp_sent: 3 });
    expect(Number.isNaN(Date.parse(String(state.update?.metadata.last_whatsapp_at)))).toBe(false);
    expect(body.data.metadata.whatsapp_sent).toBe(3);
  });

  it('records no reply without changing the existing prospect status', async () => {
    state.prospect.status = 'contacted';
    const response = await patch('no_reply');

    expect(response.status).toBe(200);
    expect(state.update?.status).toBe('contacted');
    expect(Number.isNaN(Date.parse(String(state.update?.metadata.last_whatsapp_no_reply)))).toBe(false);
  });

  it.each([
    ['replied', 'replied'],
    ['rejected', 'rejected'],
  ])('updates status for the %s follow-up action', async (action, expectedStatus) => {
    const response = await patch(action);

    expect(response.status).toBe(200);
    expect(state.update?.status).toBe(expectedStatus);
  });

  it('does not update prospects for a non-admin', async () => {
    state.authorized = false;
    const response = await patch('opened');

    expect(response.status).toBe(403);
    expect(state.update).toBeNull();
  });
});
