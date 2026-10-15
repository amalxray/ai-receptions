import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as bookingPOST } from '@/app/api/booking/route';
import { GET as availabilityGET } from '@/app/api/booking/availability/route';
import { clinicLocalToInstant } from '@/lib/services/clinicClock';

/**
 * Phase 3b — Form ⇄ Google Calendar sync contract:
 *  1. connected + success        → 201 + bookAppointment(appointment_id, NO timeZone)
 *  2. connected + Google failure → 409 + soft-delete rollback (no notification)
 *  3. disconnected               → 201 DB-only (bookAppointment never called)
 *  4. availability filter        → Google-busy slot removed, others kept
 */
const h = vi.hoisted(() => ({
  getChatBookingPolicy: vi.fn(),
  bookAppointment: vi.fn(),
  getGoogleCalendarBusyIntervals: vi.fn(),
  getAvailableSlots: vi.fn(),
  findOrCreatePatient: vi.fn(),
  createBooking: vi.fn(),
  loadProviderSchedule: vi.fn(),
  getActiveServiceById: vi.fn(),
  logEvent: vi.fn(),
  createInAppNotification: vi.fn(),
  getClinicSlugById: vi.fn(),
  rollbackCalls: [] as Array<{ table: string; payload: Record<string, unknown>; id: string }>,
}));

vi.mock('@/lib/ai/chatBookingPolicy', () => ({ getChatBookingPolicy: h.getChatBookingPolicy }));
vi.mock('@/lib/services/googleCalendarBooking', () => ({
  bookAppointment: h.bookAppointment,
  getGoogleCalendarBusyIntervals: h.getGoogleCalendarBusyIntervals,
}));
vi.mock('@/lib/services/bookingService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/bookingService')>()),
  getAvailableSlots: h.getAvailableSlots,
  findOrCreatePatient: h.findOrCreatePatient,
  createBooking: h.createBooking,
  loadProviderSchedule: h.loadProviderSchedule,
  getActiveServiceById: h.getActiveServiceById,
}));
vi.mock('@/lib/server/logging', () => ({ logEvent: h.logEvent }));
vi.mock('@/lib/notifications/inAppNotifier', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notifications/inAppNotifier')>()),
  createInAppNotification: h.createInAppNotification,
}));
vi.mock('@/lib/services/tenantAccess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/tenantAccess')>()),
  getClinicSlugById: h.getClinicSlugById,
}));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async (_column: string, id: string) => {
          h.rollbackCalls.push({ table, payload, id });
          return { error: null };
        },
      }),
    }),
  },
}));

const POLICY_CONNECTED = { checkGoogleCalendar: true, requirePhone: true, createGoogleCalendarEvent: true };
const POLICY_DISCONNECTED = { checkGoogleCalendar: false, requirePhone: true, createGoogleCalendarEvent: false };

const validBody = {
  clinic_id: '11111111-1111-1111-1111-111111111111',
  provider_id: '22222222-2222-2222-2222-222222222222',
  service: 'Dental Cleaning',
  date: '2026-07-20',
  time: '09:00',
  patient_name: 'John Doe',
  phone: '+15551234567',
};

function postRequest(): Request {
  return new Request('http://localhost/api/booking', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validBody),
  });
}

function seedBooking() {
  h.findOrCreatePatient.mockResolvedValue('patient-1');
  h.createBooking.mockResolvedValue({
    id: 'appt-1',
    scheduled_at: '2026-07-20T09:00:00.000Z',
    status: 'tentative',
    booking_token: 'tok-1',
  });
  h.getClinicSlugById.mockResolvedValue('test-clinic');
  h.createInAppNotification.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.rollbackCalls.length = 0;
  h.getChatBookingPolicy.mockResolvedValue(POLICY_DISCONNECTED);
  h.bookAppointment.mockResolvedValue({ id: 'appt-1', google_event_id: 'gcal-1', calendar_connected: true });
  h.getGoogleCalendarBusyIntervals.mockResolvedValue([]);
});

describe('POST /api/booking — Google Calendar sync', () => {
  it('connected + success → 201 and bookAppointment attached (no timeZone)', async () => {
    h.getChatBookingPolicy.mockResolvedValue(POLICY_CONNECTED);
    seedBooking();

    const res = await bookingPOST(postRequest());
    expect(res.status).toBe(201);

    expect(h.bookAppointment).toHaveBeenCalledTimes(1);
    const args = h.bookAppointment.mock.calls[0][0];
    expect(args).toEqual(
      expect.objectContaining({
        appointment_id: 'appt-1',
        clinic_id: validBody.clinic_id,
        provider_id: validBody.provider_id,
        patient_name: validBody.patient_name,
        patient_phone: validBody.phone,
        service: validBody.service,
        appointment_time: clinicLocalToInstant(validBody.date, validBody.time, 'Asia/Jerusalem').toISOString(),
      }),
    );
    // لا timeZone — mirror conversationBooking contract
    expect(args).not.toHaveProperty('timeZone');
    expect(h.rollbackCalls).toHaveLength(0);
    expect(h.createInAppNotification).toHaveBeenCalledTimes(1);
  });

  it('connected + Google failure → 409, soft-delete rollback, no notification', async () => {
    h.getChatBookingPolicy.mockResolvedValue(POLICY_CONNECTED);
    h.bookAppointment.mockRejectedValue(
      new Error('Double booking prevention triggered: Google Calendar is busy at the requested time.'),
    );
    seedBooking();

    const res = await bookingPOST(postRequest());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe('تعذّر تأكيد الحجز. يرجى المحاولة مرة أخرى.');
    expect(h.rollbackCalls).toHaveLength(1);
    expect(h.rollbackCalls[0].table).toBe('appointments');
    expect(h.rollbackCalls[0].id).toBe('appt-1');
    expect(String(h.rollbackCalls[0].payload.deleted_at ?? '')).not.toBe('');
    expect(h.logEvent.mock.calls.some((call) => call[0] === 'booking_google_sync_failed')).toBe(true);
    expect(h.createInAppNotification).not.toHaveBeenCalled();
  });

  it('disconnected → 201 DB-only: bookAppointment and rollback never run', async () => {
    seedBooking();

    const res = await bookingPOST(postRequest());
    expect(res.status).toBe(201);
    expect(h.bookAppointment).not.toHaveBeenCalled();
    expect(h.rollbackCalls).toHaveLength(0);
    expect(h.createInAppNotification).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/booking/availability — Google busy filter', () => {
  it('removes the busy-overlapping slot and keeps the rest', async () => {
    h.getAvailableSlots.mockResolvedValue([
      '2026-07-20T09:00:00.000Z',
      '2026-07-20T10:00:00.000Z',
      '2026-07-20T11:00:00.000Z',
    ]);
    h.getGoogleCalendarBusyIntervals.mockResolvedValue([
      { start: '2026-07-20T09:00', end: '2026-07-20T10:00' },
    ]);
    h.loadProviderSchedule.mockResolvedValue({ appointmentDurationMinutes: 30 });

    const req = new Request(
      'http://localhost/api/booking/availability?clinic_id=11111111-1111-1111-1111-111111111111&provider_id=22222222-2222-2222-2222-222222222222&date=2026-07-20',
    );
    const res = await availabilityGET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    // 09:00 يتداخل مع busy (09:00–10:00) → محذوف؛ البقية محفوظة
    expect(body.data.slots).toEqual(['2026-07-20T10:00:00.000Z', '2026-07-20T11:00:00.000Z']);
  });

  it('calendar fetch failure keeps all slots (Form never breaks)', async () => {
    h.getAvailableSlots.mockResolvedValue(['2026-07-20T09:00:00.000Z']);
    h.getGoogleCalendarBusyIntervals.mockRejectedValue(new Error('Google API down'));

    const req = new Request(
      'http://localhost/api/booking/availability?clinic_id=11111111-1111-1111-1111-111111111111&provider_id=22222222-2222-2222-2222-222222222222&date=2026-07-20',
    );
    const res = await availabilityGET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.slots).toEqual(['2026-07-20T09:00:00.000Z']);
    expect(h.logEvent.mock.calls.some((call) => call[0] === 'booking_availability_google_busy_error')).toBe(true);
  });
});