import { describe, expect, it } from 'vitest';
import { getChatBookingPolicy } from '@/lib/ai/chatBookingPolicy';

describe('global public-chat booking policy', () => {
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
});
