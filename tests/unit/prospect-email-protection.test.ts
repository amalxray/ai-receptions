import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  insertResult: { data: { id: 'email-record-id' }, error: null as null | { code?: string; message: string } },
  duplicateResult: { data: null as null | { id: string }, error: null as null | { message: string } },
  prospect: null as null | {
    id: string;
    clinic_name: string;
    doctor_name: string | null;
    email: string;
    city: string;
    status: string;
    metadata: Record<string, unknown>;
    unsubscribe_token: string;
    unsubscribed_at: string | null;
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      let prospectLookup = false;
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
        eq: vi.fn(() => {
          prospectLookup = true;
          return query;
        }),
        maybeSingle: vi.fn(async () => (
          prospectLookup
            ? { data: state.prospect, error: null }
            : state.duplicateResult
        )),
      };
      return query;
    },
  },
}));

import {
  canSendEmail,
  claimEmailSlot,
  sendProspectEmail,
} from '@/lib/services/prospecting/prospectEmail';
import { PLATFORM_LINKS, PLATFORM_LINKS_ARABIC_BLOCK } from '@/lib/communications/platformLinks';

describe('prospect email protection helpers', () => {
  beforeEach(() => {
    state.insertResult = { data: { id: 'email-record-id' }, error: null };
    state.duplicateResult = { data: null, error: null };
    state.prospect = {
      id: 'prospect-id',
      clinic_name: 'عيادة النور',
      doctor_name: 'د. نور',
      email: 'clinic@example.test',
      city: 'نابلس',
      status: 'new',
      metadata: {},
      unsubscribe_token: 'unsubscribe-token',
      unsubscribed_at: null,
    };
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

  it('includes the central links block once in the default prospect email preview', async () => {
    const result = await sendProspectEmail(
      'prospect-id',
      { preview: true },
      { useDefaultBody: true },
    );

    expect(result).toHaveProperty('preview', true);
    if (!('body' in result)) throw new Error('Expected a prospect email preview body');
    expect(result.body).toContain(PLATFORM_LINKS_ARABIC_BLOCK);
    expect(result.body.split(PLATFORM_LINKS.showcaseImaging)).toHaveLength(2);
  });
});
