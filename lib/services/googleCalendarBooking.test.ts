import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bookAppointment } from './googleCalendarBooking';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  inserts: [] as Array<Record<string, unknown>>,
  googleInsert: vi.fn(),
  googleDelete: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: mocks.from },
}));

vi.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: vi.fn() },
    calendar: vi.fn(() => ({
      events: {
        insert: mocks.googleInsert,
        delete: mocks.googleDelete,
      },
    })),
  },
}));

function query(result: { data: unknown; error: null }) {
  const chain: Record<string, any> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lt = vi.fn(() => chain);
  chain.in = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);
  chain.insert = vi.fn((row: Record<string, unknown>) => {
    mocks.inserts.push(row);
    return chain;
  });
  chain.single = vi.fn(async () => result);
  return chain;
}

describe('Google Calendar booking configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inserts = [];
    mocks.googleInsert.mockResolvedValue({ data: { id: 'real-google-event-id' } });
    process.env.GOOGLE_CALENDAR_ID = 'fallback-calendar@example.com';
    process.env.GOOGLE_CLIENT_EMAIL = 'calendar-service@example.com';
    process.env.GOOGLE_PRIVATE_KEY = 'test-private-key';
  });

  it('prefers the clinic calendar id over the environment fallback', async () => {
    mocks.from
      .mockReturnValueOnce(query({ data: { google_calendar_id: 'clinic-calendar@example.com' }, error: null }))
      .mockReturnValueOnce(query({ data: [], error: null }))
      .mockReturnValueOnce(query({
        data: {
          id: 'appointment-1',
          clinic_id: 'clinic-1',
          patient_name: 'Patient',
          patient_phone: '12345678',
          service: 'Dental exam',
          appointment_time: '2026-10-07T09:00:00.000Z',
          google_calendar_id: 'clinic-calendar@example.com',
          google_event_id: 'real-google-event-id',
          status: 'pending',
        },
        error: null,
      }));

    await bookAppointment({
      clinic_id: 'clinic-1',
      patient_name: 'Patient',
      patient_phone: '12345678',
      service: 'Dental exam',
      appointment_time: '2026-10-07T09:00:00.000Z',
    });

    expect(mocks.inserts[0].google_calendar_id).toBe('clinic-calendar@example.com');
    expect(mocks.inserts[0].google_event_id).toBe('real-google-event-id');
    expect(mocks.googleInsert).toHaveBeenCalledWith(expect.objectContaining({
      calendarId: 'clinic-calendar@example.com',
    }));
    expect(mocks.from.mock.calls[0][0]).toBe('clinics');
  });

  it('uses GOOGLE_CALENDAR_ID when the clinic has no calendar configured', async () => {
    mocks.from
      .mockReturnValueOnce(query({ data: { google_calendar_id: null }, error: null }))
      .mockReturnValueOnce(query({ data: [], error: null }))
      .mockReturnValueOnce(query({
        data: {
          id: 'appointment-2',
          clinic_id: 'clinic-1',
          patient_name: 'Patient',
          patient_phone: '12345678',
          service: 'Dental exam',
          appointment_time: '2026-10-07T09:00:00.000Z',
          google_calendar_id: 'fallback-calendar@example.com',
          google_event_id: 'real-google-event-id',
          status: 'pending',
        },
        error: null,
      }));

    await bookAppointment({
      clinic_id: 'clinic-1',
      patient_name: 'Patient',
      patient_phone: '12345678',
      service: 'Dental exam',
      appointment_time: '2026-10-07T09:00:00.000Z',
    });

    expect(mocks.inserts[0].google_calendar_id).toBe('fallback-calendar@example.com');
    expect(mocks.inserts[0].google_event_id).toBe('real-google-event-id');
  });
});
