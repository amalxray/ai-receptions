import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bookAppointment,
  checkAvailability,
  getGoogleCalendarBusyIntervals,
} from '@/lib/services/googleCalendarBooking';

const calendarMocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

const bookingMocks = vi.hoisted(() => ({
  createBooking: vi.fn(),
  findOrCreatePatient: vi.fn(),
  getAvailableSlots: vi.fn(),
  isClinicHoliday: vi.fn(),
  loadExistingAppointments: vi.fn(),
  loadProviderSchedule: vi.fn(),
}));
const supabaseMocks = vi.hoisted(() => {
  const result: { data: unknown; error: unknown } = { data: null, error: null };
  const query: Record<string, any> = {};
  for (const method of ['from', 'select', 'eq', 'is', 'gte', 'lt', 'in', 'neq', 'update', 'insert']) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(async () => result);
  query.single = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  query.setResult = (value: { data: unknown; error: unknown }) => {
    result.data = value.data;
    result.error = value.error;
  };
  return { query };
});

vi.mock('@/lib/services/bookingService', () => bookingMocks);
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: supabaseMocks.query }));
vi.mock('@/lib/services/scheduling', () => ({
  checkSlotAvailability: vi.fn(() => ({ available: true, reason: 'available', endsAt: '2026-10-14T09:30:00.000Z' })),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: vi.fn() },
    calendar: vi.fn(() => ({ events: { list: calendarMocks.list } })),
  },
}));

describe('getGoogleCalendarBusyIntervals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'calendar@example.test';
    process.env.GOOGLE_PRIVATE_KEY = 'private-key';
    process.env.GOOGLE_CALENDAR_ID = 'calendar-id';
    calendarMocks.list.mockResolvedValue({ data: { items: [] } });
    bookingMocks.createBooking.mockResolvedValue({
      id: 'appointment-id',
      scheduled_at: '2026-10-14T09:00:00.000Z',
      status: 'tentative',
      booking_token: 'booking-token',
    });
    bookingMocks.findOrCreatePatient.mockResolvedValue('patient-id');
    bookingMocks.getAvailableSlots.mockResolvedValue(['2026-10-14T09:00:00.000Z']);
    bookingMocks.isClinicHoliday.mockResolvedValue(false);
    bookingMocks.loadExistingAppointments.mockResolvedValue([]);
    supabaseMocks.query.setResult({ data: { id: 'appointment-id', status: 'tentative' }, error: null });
    supabaseMocks.query.eq.mockClear();
    bookingMocks.loadProviderSchedule.mockResolvedValue({
      providerId: 'provider-id',
      clinicId: 'clinic-id',
      days: [{ weekday: 3, enabled: true, start: '09:00', end: '17:00', breaks: [] }],
      appointmentDurationMinutes: 30,
    });
  });

  it('queries exactly the patient-requested UTC calendar day', async () => {
    await getGoogleCalendarBusyIntervals('2026-10-14', 'UTC');

    expect(calendarMocks.list).toHaveBeenCalledWith(expect.objectContaining({
      calendarId: 'calendar-id',
      timeMin: '2026-10-14T00:00:00.000Z',
      timeMax: '2026-10-15T00:00:00.000Z',
      singleEvents: true,
    }));
  });

  it('returns only busy event intervals from Google Calendar', async () => {
    calendarMocks.list.mockResolvedValue({
      data: {
        items: [
          { status: 'confirmed', start: { dateTime: '2026-10-14T10:00:00.000Z' }, end: { dateTime: '2026-10-14T10:30:00.000Z' } },
          { status: 'cancelled', start: { dateTime: '2026-10-14T11:00:00.000Z' }, end: { dateTime: '2026-10-14T11:30:00.000Z' } },
        ],
      },
    });

    await expect(getGoogleCalendarBusyIntervals('2026-10-14', 'UTC')).resolves.toEqual([
      { start: '2026-10-14T10:00', end: '2026-10-14T10:30' },
    ]);
  });

  it('uses only tenant-scoped local slots when Google credentials are missing', async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_PRIVATE_KEY;
    delete process.env.GOOGLE_CALENDAR_ID;

    await expect(checkAvailability('clinic-id', 'provider-id', '2026-10-14', 'UTC')).resolves.toMatchObject({
      date: '2026-10-14',
      timezone: 'UTC',
      available: true,
      slots: [{ start: '2026-10-14T09:00:00.000Z', end: '2026-10-14T09:30:00.000Z' }],
    });
    expect(bookingMocks.getAvailableSlots).toHaveBeenCalledWith(
      'clinic-id',
      'provider-id',
      '2026-10-14',
      200,
    );
    expect(calendarMocks.list).not.toHaveBeenCalled();
  });

  it('continues local booking as tentative when Google credentials are missing', async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_PRIVATE_KEY;
    delete process.env.GOOGLE_CALENDAR_ID;

    await expect(bookAppointment({
      clinic_id: 'clinic-id',
      provider_id: 'provider-id',
      patient_name: 'Test Patient',
      patient_phone: '12345678',
      appointment_time: '2026-10-14T09:00:00.000Z',
      timezone: 'UTC',
    })).resolves.toMatchObject({
      id: 'appointment-id',
      status: 'tentative',
      google_event_id: null,
      calendar_connected: false,
    });
    expect(bookingMocks.createBooking).toHaveBeenCalledWith(expect.objectContaining({
      clinicId: 'clinic-id',
      providerId: 'provider-id',
      date: '2026-10-14',
      time: '09:00',
      patientId: 'patient-id',
    }));
    expect(calendarMocks.list).not.toHaveBeenCalled();
  });

  it('rejects an existing appointment owned by a different clinic/provider', async () => {
    supabaseMocks.query.setResult({ data: null, error: null });
    await expect(bookAppointment({
      clinic_id: 'clinic-id',
      provider_id: 'provider-id',
      appointment_id: 'appointment-id',
      patient_name: 'Test Patient',
      patient_phone: '12345678',
      appointment_time: '2026-10-14T09:00:00.000Z',
      timezone: 'UTC',
    })).rejects.toThrow('Appointment not found for this clinic and provider.');

    expect(supabaseMocks.query.eq).toHaveBeenCalledWith('clinic_id', 'clinic-id');
    expect(supabaseMocks.query.eq).toHaveBeenCalledWith('provider_id', 'provider-id');
    expect(supabaseMocks.query.eq).toHaveBeenCalledWith('id', 'appointment-id');
  });
});
