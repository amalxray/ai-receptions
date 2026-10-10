import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChatBookingPolicy } from '@/lib/ai/chatBookingPolicy';
import { getGoogleCalendarConnectionStatus } from '@/lib/services/googleCalendarOAuth';

vi.mock('@/lib/services/googleCalendarOAuth', () => ({
  getGoogleCalendarConnectionStatus: vi.fn(),
}));

const getConnectionStatus = vi.mocked(getGoogleCalendarConnectionStatus);

describe('clinic-scoped public-chat booking policy', () => {
  beforeEach(() => {
    getConnectionStatus.mockResolvedValue({ connected: true, connected_at: '2026-10-10T12:00:00.000Z', email: 'clinic@example.test' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('enables calendar checks and event creation only for the requested connected clinic', async () => {
    await expect(getChatBookingPolicy('clinic-a')).resolves.toEqual({
      checkGoogleCalendar: true,
      requirePhone: true,
      createGoogleCalendarEvent: true,
    });
    expect(getConnectionStatus).toHaveBeenCalledWith('clinic-a');
  });

  it('keeps an unconnected clinic local-only even if another clinic is connected', async () => {
    getConnectionStatus.mockResolvedValue({ connected: false, connected_at: null, email: null });

    await expect(getChatBookingPolicy('clinic-b')).resolves.toEqual({
      checkGoogleCalendar: false,
      requirePhone: true,
      createGoogleCalendarEvent: false,
    });
    expect(getConnectionStatus).toHaveBeenCalledWith('clinic-b');
  });
});
