import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const query: Record<string, any> = {};
  for (const method of ['select', 'eq', 'is', 'contains', 'insert', 'update']) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn();
  query.single = vi.fn();
  return { client: { from: vi.fn(() => query) }, query };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mocks.client }));
vi.mock('@/lib/server/logging', () => ({ logEvent: vi.fn() }));

import { persistPendingBookingLead } from './pendingBookingLead';

const input = {
  clinicId: 'clinic-1',
  conversationId: 'conversation-1',
  name: 'Patient One',
  phone: '+972-555-0100',
  serviceId: 'service-1',
  serviceName: 'Orthodontics',
  requestedDate: '2026-10-22',
  requestedTime: '10:00',
  failureSource: 'google_calendar',
};

describe('persistPendingBookingLead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.select.mockReturnValue(mocks.query);
    mocks.query.eq.mockReturnValue(mocks.query);
    mocks.query.is.mockReturnValue(mocks.query);
    mocks.query.contains.mockReturnValue(mocks.query);
    mocks.query.insert.mockReturnValue(mocks.query);
    mocks.query.update.mockReturnValue(mocks.query);
  });

  it('inserts a pending clinic lead with request metadata when none exists', async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.query.single.mockResolvedValue({ data: { id: 'lead-1' }, error: null });

    await persistPendingBookingLead(input);

    expect(mocks.client.from).toHaveBeenCalledWith('leads');
    expect(mocks.query.insert).toHaveBeenCalledWith([expect.objectContaining({
      clinic_id: input.clinicId,
      name: input.name,
      phone: input.phone,
      source: 'ai_chat_calendar_unavailable',
      status: 'pending',
      metadata: expect.objectContaining({
        conversation_id: input.conversationId,
        service_id: input.serviceId,
        requested_date: input.requestedDate,
        requested_time: input.requestedTime,
      }),
    })]);
  });

  it('updates the conversation pending lead instead of creating a duplicate', async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: { id: 'lead-existing' }, error: null });
    mocks.query.single.mockResolvedValue({ data: { id: 'lead-existing' }, error: null });

    await persistPendingBookingLead(input);

    expect(mocks.query.update).toHaveBeenCalledWith(expect.objectContaining({
      name: input.name,
      phone: input.phone,
      metadata: expect.objectContaining({ conversation_id: input.conversationId }),
    }));
    expect(mocks.query.insert).not.toHaveBeenCalled();
  });
});
