import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGoogleCalendarBusyIntervals } from '@/lib/services/googleCalendarBooking';

const calendarMocks = vi.hoisted(() => ({
  list: vi.fn(),
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
});
