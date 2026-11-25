import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  insertResult: { data: { id: 'email-record-id' }, error: null as null | { code?: string; message: string } },
  duplicateResult: { data: null as null | { id: string }, error: null as null | { message: string } },
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'prospect_emails') {
        const query = {
          insert: vi.fn(() => query),
          select: vi.fn(() => query),
          single: vi.fn(async () => state.insertResult),
        };
        return query;
      }

      const query = {
        select: vi.fn(() => query),
        ilike: vi.fn(() => query),
        not: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(async () => state.duplicateResult),
      };
      return query;
    },
  },
}));

import { canSendEmail, claimEmailSlot } from '@/lib/services/prospecting/prospectEmail';

describe('prospect email protection helpers', () => {
  beforeEach(() => {
    state.insertResult = { data: { id: 'email-record-id' }, error: null };
    state.duplicateResult = { data: null, error: null };
  });

  it('claims an available email slot', async () => {
    await expect(claimEmailSlot('prospect-id', 'initial', {
      subject: 'Subject',
      body: 'Body',
    })).resolves.toBe('email-record-id');
  });

  it('returns null when the email slot already exists', async () => {
    state.insertResult = { data: null, error: { code: '23505', message: 'duplicate' } };
    await expect(claimEmailSlot('prospect-id', 'initial')).resolves.toBeNull();
  });

  it('surfaces database failures while claiming a slot', async () => {
    state.insertResult = { data: null, error: { code: 'XX000', message: 'database unavailable' } };
    await expect(claimEmailSlot('prospect-id', 'initial')).rejects.toThrow('database unavailable');
  });

  it('blocks a prospect that unsubscribed directly', async () => {
    await expect(canSendEmail({
      email: 'clinic@example.test',
      unsubscribed_at: '2026-01-01T00:00:00.000Z',
    })).resolves.toBe(false);
  });

  it('blocks a prospect when another record with the same email unsubscribed', async () => {
    state.duplicateResult = { data: { id: 'other-prospect' }, error: null };
    await expect(canSendEmail({
      email: 'Clinic@Example.test',
      unsubscribed_at: null,
    })).resolves.toBe(false);
  });

  it('allows an active email with no unsubscribed duplicate', async () => {
    await expect(canSendEmail({
      email: 'clinic@example.test',
      unsubscribed_at: null,
    })).resolves.toBe(true);
  });
});
