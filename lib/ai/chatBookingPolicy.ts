import { getGoogleCalendarConnectionStatus } from '@/lib/services/googleCalendarOAuth';

export type ChatBookingPolicy = {
  checkGoogleCalendar: boolean;
  requirePhone: true;
  createGoogleCalendarEvent: boolean;
};

/**
 * Calendar checks and event creation are enabled only for this clinic's
 * explicitly connected Google account. A missing connection remains local-only.
 */
export async function getChatBookingPolicy(clinicId: string): Promise<ChatBookingPolicy> {
  const { connected } = await getGoogleCalendarConnectionStatus(clinicId);
  return {
    checkGoogleCalendar: connected,
    requirePhone: true,
    createGoogleCalendarEvent: connected,
  };
}
