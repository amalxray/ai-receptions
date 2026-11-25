import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  prospects: [] as Array<Record<string, unknown>>,
  emails: [] as Array<Record<string, unknown>>,
  sendProspectEmail: vi.fn(),
  updateValues: null as Record<string, unknown> | null,
  updateId: '',
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      let selectedId = '';
      let updateMode = false;
      const query = {
        select: () => query,
        not: () => query,
        in: () => query,
        eq: (column: string, value: string) => {
          if (column === 'id') {
            selectedId = value;
            if (updateMode) state.updateId = value;
          }
          return query;
        },
        maybeSingle: async () => ({
          data: state.prospects.find((prospect) => prospect.id === selectedId) ?? null,
          error: null,
        }),
        update: (values: Record<string, unknown>) => {
          state.updateValues = values;
          state.updateId = selectedId;
          updateMode = true;
          return query;
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          const result = updateMode
            ? { data: null, error: null }
            : table === 'prospects'
              ? { data: state.prospects.filter((prospect) => prospect.email !== null), error: null }
              : { data: state.emails, error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  },
}));

vi.mock('@/lib/services/prospecting/prospectEmail', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/prospecting/prospectEmail')>();
  return {
    ...actual,
    sendProspectEmail: state.sendProspectEmail,
  };
});

import {
  generateFollowUpEmail1,
  generateFollowUpEmail2,
} from '@/lib/services/marketing/marketing-agent';
import {
  getPendingFollowUps,
  sendFollowUp,
  skipFollowUp,
} from '@/lib/services/prospecting/followUp';

const now = new Date('2026-01-11T12:00:00.000Z');
const prospectId = 'd6d3ea46-074a-4fdb-b502-fd2259ab6739';
const unsubToken = 'a4d3ea46-074a-4fdb-b502-fd2259ab6739';

function makeProspect(overrides: Record<string, unknown> = {}) {
  return {
    id: prospectId,
    clinic_name: 'عيادة النور',
    doctor_name: 'د. نور',
    phone: '+970599123456',
    email: 'clinic@example.test',
    city: 'نابلس',
    country: 'PS',
    status: 'contacted',
    metadata: {},
    unsubscribe_token: unsubToken,
    unsubscribed_at: null,
    ...overrides,
  };
}

function makeEmail(type: string, sentAt: string, overrides: Record<string, unknown> = {}) {
  return {
    prospect_id: prospectId,
    type,
    status: 'sent',
    sent_at: sentAt,
    ...overrides,
  };
}

describe('hybrid prospect follow-up', () => {
  beforeEach(() => {
    state.prospects = [makeProspect()];
    state.emails = [makeEmail('initial', '2026-01-01T12:00:00.000Z')];
    state.sendProspectEmail.mockReset().mockResolvedValue({});
    state.updateValues = null;
    state.updateId = '';
  });

  it('generates the first follow-up with the requested unsubscribe link', () => {
    const body = generateFollowUpEmail1('عيادة النور', 'https://example.test/unsubscribe/token');
    expect(body).toContain('https://example.test/unsubscribe/token');
    expect(body).toContain('أتابع رسالتي السابقة');
  });

  it('generates a clear final breakup message with an unsubscribe link', () => {
    const body = generateFollowUpEmail2('عيادة النور', 'https://example.test/unsubscribe/token');
    expect(body).toContain('لن أرسل رسائل متابعة أخرى');
    expect(body).toContain('https://example.test/unsubscribe/token');
  });

  it('lists an eligible first follow-up three days after an initial or manual email', async () => {
    state.emails = [makeEmail('manual', '2026-01-01T12:00:00.000Z')];
    const pending = await getPendingFollowUps(new Date('2026-01-04T12:00:00.000Z'));
    expect(pending.stage_1.map((item) => item.id)).toEqual([prospectId]);
    expect(pending.stage_1[0].due_at).toBe('2026-01-04T12:00:00.000Z');

    state.emails = [];
    state.prospects = [makeProspect({ metadata: { last_emailed_at: '2026-01-01T12:00:00.000Z' } })];
    const legacyPending = await getPendingFollowUps(new Date('2026-01-04T12:00:00.000Z'));
    expect(legacyPending.stage_1.map((item) => item.id)).toEqual([prospectId]);
  });

  it('does not list a first follow-up before its three-day due date', async () => {
    const pending = await getPendingFollowUps(new Date('2026-01-03T11:59:59.000Z'));
    expect(pending.stage_1).toEqual([]);
  });

  it('lists the final follow-up seven days after the first follow-up was sent', async () => {
    state.emails = [
      makeEmail('initial', '2026-01-01T12:00:00.000Z'),
      makeEmail('follow_up_1', '2026-01-04T12:00:00.000Z'),
    ];
    const pending = await getPendingFollowUps(now);
    expect(pending.stage_1).toEqual([]);
    expect(pending.stage_2.map((item) => item.id)).toEqual([prospectId]);
    expect(pending.stage_2[0].due_at).toBe('2026-01-11T12:00:00.000Z');
  });

  it('excludes replied and unsubscribed clinics including duplicate unsubscribed addresses', async () => {
    state.prospects = [
      makeProspect({ id: 'replied', status: 'replied' }),
      makeProspect({ id: 'unsubscribed', unsubscribed_at: '2026-01-02T00:00:00.000Z' }),
      makeProspect({ id: 'duplicate', email: 'CLINIC@example.test' }),
      makeProspect({ id: 'unsubscribe-record', email: 'clinic@example.test', unsubscribed_at: '2026-01-02T00:00:00.000Z' }),
    ];
    state.emails = state.prospects
      .filter((prospect) => prospect.id !== 'unsubscribe-record')
      .map((prospect) => makeEmail('initial', '2026-01-01T12:00:00.000Z', { prospect_id: prospect.id }));

    const pending = await getPendingFollowUps(now);
    expect(pending.stage_1).toEqual([]);
    expect(pending.stage_2).toEqual([]);
  });

  it('allows a failed first follow-up claim to be retried', async () => {
    state.emails.push(makeEmail('follow_up_1', '2026-01-04T12:00:00.000Z', { status: 'failed' }));
    state.emails.push(makeEmail('follow_up_1', '2026-01-04T12:00:00.000Z', { status: 'queued' }));
    const queuedPending = await getPendingFollowUps(new Date('2026-01-05T12:00:00.000Z'));
    expect(queuedPending.stage_1).toEqual([]);

    state.emails = state.emails.filter((email) => email.status !== 'queued');
    const pending = await getPendingFollowUps(new Date('2026-01-05T12:00:00.000Z'));
    expect(pending.stage_1.map((item) => item.id)).toEqual([prospectId]);
  });

  it('sends the final follow-up using the matching atomic email type', async () => {
    state.emails.push(makeEmail('follow_up_1', '2026-01-04T12:00:00.000Z'));
    const result = await sendFollowUp(prospectId, 'stage_2');
    expect(result).toEqual({ success: true });
    expect(state.sendProspectEmail).toHaveBeenCalledWith(
      prospectId,
      expect.objectContaining({
        subject: expect.stringContaining('آخر متابعة'),
        body: expect.stringContaining(`/unsubscribe/${unsubToken}`),
      }),
      { type: 'follow_up_2' },
    );
  });

  it('persists skipped-stage state in prospect metadata without a migration', async () => {
    const result = await skipFollowUp(prospectId, 'stage_1');
    expect(result).toEqual({ success: true });
    expect(state.updateId).toBe(prospectId);
    expect(state.updateValues).toMatchObject({
      metadata: { follow_up_1_skipped_at: expect.any(String) },
    });
  });
});
