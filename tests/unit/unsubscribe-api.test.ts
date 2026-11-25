import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  prospect: { id: 'prospect-id', email: 'clinic@example.test' } as null | { id: string; email: string | null },
  updatedPattern: '',
  updateError: null as null | { message: string },
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table !== 'prospects') throw new Error(`Unexpected table: ${table}`);
      let isUpdate = false;
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: state.prospect, error: null }),
        update: () => {
          isUpdate = true;
          return query;
        },
        ilike: (_column: string, value: string) => {
          state.updatedPattern = value;
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => resolve({
          data: null,
          error: isUpdate ? state.updateError : null,
        }),
      };
      return query;
    },
  },
}));

import { POST } from '@/app/api/unsubscribe/[token]/route';

const token = 'd6d3ea46-074a-4fdb-b502-fd2259ab6739';

describe('POST /api/unsubscribe/[token]', () => {
  beforeEach(() => {
    state.prospect = { id: 'prospect-id', email: 'clinic@example.test' };
    state.updatedPattern = '';
    state.updateError = null;
  });

  it('marks matching email records as unsubscribed', async () => {
    const response = await POST(new Request(`https://app.test/api/unsubscribe/${token}`, { method: 'POST' }), {
      params: { token },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(state.updatedPattern).toBe('clinic@example.test');
  });

  it('rejects unknown unsubscribe tokens', async () => {
    state.prospect = null;
    const response = await POST(new Request(`https://app.test/api/unsubscribe/${token}`, { method: 'POST' }), {
      params: { token },
    });

    expect(response.status).toBe(404);
  });
});
