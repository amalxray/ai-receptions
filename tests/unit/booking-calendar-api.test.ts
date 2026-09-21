import { describe, it, expect, vi, beforeEach } from 'vitest';

// #39 follow-up — /api/booking/calendar powers the disabled days of the booking
// calendar. It must never hide days it is unsure about: the slots API stays the
// single source of truth, so a broken probe degrades to the old behaviour.

const mockBookingService = vi.hoisted(() => ({ loadProviderSchedule: vi.fn() }));
vi.mock('@/lib/services/bookingService', () => mockBookingService);

const mockLogging = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock('@/lib/server/logging', () => mockLogging);

const mockDb = vi.hoisted(() => {
  const result: { data: any; error: any } = { data: [], error: null };
  const query: Record<string, any> = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
  };
  query.from.mockImplementation(() => query);
  query.select.mockImplementation(() => query);
  query.eq.mockImplementation(() => query);
  query.gte.mockImplementation(() => query);
  query.lte.mockImplementation(() => Promise.resolve(result));
  return { supabaseAdmin: query, result };
});
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: mockDb.supabaseAdmin }));

import { GET } from '@/app/api/booking/calendar/route';

const CLINIC = '11111111-1111-1111-1111-111111111111';
const PROVIDER = '33333333-3333-3333-3333-333333333333';

function request(params: Record<string, string>): Request {
  return new Request(`http://localhost/api/booking/calendar?${new URLSearchParams(params)}`);
}

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    providerId: PROVIDER,
    clinicId: CLINIC,
    days: [
      { weekday: 0, enabled: true, start: '09:00', end: '17:00' },
      { weekday: 5, enabled: false, start: '09:00', end: '17:00' },
    ],
    vacationDates: [],
    appointmentDurationMinutes: 30,
    ...overrides,
  };
}

describe('GET /api/booking/calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.result.data = [];
    mockDb.result.error = null;
    mockBookingService.loadProviderSchedule.mockResolvedValue(schedule());
  });

  it('returns holidays, vacations and the working weekdays for the month', async () => {
    mockDb.result.data = [{ holiday_date: '2026-09-15' }];
    mockBookingService.loadProviderSchedule.mockResolvedValue(schedule({ vacationDates: ['2026-09-30'] }));

    const res = await GET(request({ clinic_id: CLINIC, provider_id: PROVIDER, month: '2026-09' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.month).toBe('2026-09');
    expect(body.data.closed_days).toEqual(['2026-09-15', '2026-09-30']);
    expect(body.data.working_weekdays).toEqual([0]);
    expect(body.data.schedule_known).toBe(true);
  });

  it('only reports closures inside the requested month', async () => {
    mockDb.result.data = [{ holiday_date: '2026-10-02' }]; // next month
    const res = await GET(request({ clinic_id: CLINIC, provider_id: PROVIDER, month: '2026-09' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.closed_days).toEqual([]);
  });

  it('fails open when no weekly pattern is configured', async () => {
    mockBookingService.loadProviderSchedule.mockResolvedValue(schedule({ days: [] }));

    const res = await GET(request({ clinic_id: CLINIC, provider_id: PROVIDER, month: '2026-09' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.schedule_known).toBe(false);
    expect(body.data.working_weekdays).toEqual([]);
    expect(body.data.closed_days).toEqual([]);
  });

  it('keeps vacations when the holiday lookup fails (fail-open)', async () => {
    mockDb.result.error = { message: 'relation does not exist' };
    mockBookingService.loadProviderSchedule.mockResolvedValue(schedule({ vacationDates: ['2026-09-30'] }));

    const res = await GET(request({ clinic_id: CLINIC, provider_id: PROVIDER, month: '2026-09' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.closed_days).toEqual(['2026-09-30']);
    expect(mockLogging.logEvent).toHaveBeenCalledWith(
      'booking_calendar_holidays_error',
      expect.objectContaining({ clinic_id: CLINIC }),
      'error'
    );
  });

  it('returns 404 when the provider is not in the clinic', async () => {
    mockBookingService.loadProviderSchedule.mockResolvedValue(null);

    const res = await GET(request({ clinic_id: CLINIC, provider_id: PROVIDER, month: '2026-09' }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('Provider not found for this clinic');
  });

  it('returns 400 for missing params or a malformed month', async () => {
    expect((await GET(request({ provider_id: PROVIDER, month: '2026-09' }))).status).toBe(400);
    expect((await GET(request({ clinic_id: 'not-a-uuid', provider_id: PROVIDER, month: '2026-09' }))).status).toBe(400);
    expect((await GET(request({ clinic_id: CLINIC, provider_id: PROVIDER, month: '2026-9' }))).status).toBe(400);
    expect(mockBookingService.loadProviderSchedule).not.toHaveBeenCalled();
  });

  it('returns 500 when the schedule lookup throws', async () => {
    mockBookingService.loadProviderSchedule.mockRejectedValue(new Error('DB down'));

    const res = await GET(request({ clinic_id: CLINIC, provider_id: PROVIDER, month: '2026-09' }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal server error');
  });
});
