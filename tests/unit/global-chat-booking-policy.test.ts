import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChatBookingPolicy } from '@/lib/ai/chatBookingPolicy';

describe('global public-chat booking policy', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', 'service@example.com');
    vi.stubEnv('GOOGLE_PRIVATE_KEY', '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----');
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'test-calendar');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const tenants: Array<[string, string]> = [
    ['amal-clinic', 'clinic'],
    ['hala-clinic', 'clinic'],
    ['amal-x-ray-center', 'imaging_center'],
    ['future-dental-lab', 'dental_lab'],
    ['future-activity', 'unknown'],
  ];

  it.each(tenants)('%s (%s) uses the same real booking guarantees', (slug, activity) => {
    expect(getChatBookingPolicy(slug, activity)).toEqual({
      checkGoogleCalendar: true,
      requirePhone: true,
      createGoogleCalendarEvent: true,
    });
  });

  it('disables Google checks when calendar configuration is missing', () => {
    vi.stubEnv('GOOGLE_PRIVATE_KEY', 'not-a-private-key');

    expect(getChatBookingPolicy('amal-x-ray-center', 'imaging_center')).toEqual({
      checkGoogleCalendar: false,
      requirePhone: true,
      createGoogleCalendarEvent: false,
    });
  });
});
